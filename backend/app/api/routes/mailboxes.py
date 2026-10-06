import json
from datetime import UTC, datetime
from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser
from app.api.schemas import (
    AuthorizeOut,
    ImapConnectionOut,
    ImapCredentialsUpdate,
    ImapMailboxCreate,
    ImapPreset,
    MailboxOut,
    MailboxUpdate,
    SyncQueued,
)
from app.compose.mailer import SendError, verify_smtp
from app.core.config import PLANS, get_settings
from app.core.db import uuid7
from app.core.errors import AppError, Conflict, LimitReached, NotFound
from app.core.logging import log
from app.core.redis import Keys, get_redis
from app.core.runtime import google_config
from app.core.security import new_opaque_token, vault
from app.models import Mailbox, MailboxStatus, Provider, User
from app.providers import get_provider
from app.providers import gmail as gmail_api
from app.providers.base import ProviderError, ReauthRequired
from app.providers.imap import PRESETS, ImapCredentials
from app.services.ingest import request_sync

router = APIRouter(prefix="/mailboxes", tags=["mailboxes"])
oauth_router = APIRouter(prefix="/oauth", tags=["mailboxes"])
OAUTH_STATE_TTL_S = 600


async def _get(db: DB, user_id: UUID, mailbox_id: UUID) -> Mailbox:
    mailbox = await db.get(Mailbox, mailbox_id)
    if mailbox is None or mailbox.user_id != user_id:
        raise NotFound("Mailbox not found")
    return mailbox


async def _check_limit(db: DB, user: User, address: str, provider: Provider) -> Mailbox | None:
    existing = await db.scalar(select(Mailbox).where(
        Mailbox.user_id == user.id, Mailbox.provider == provider, Mailbox.address == address))
    if existing:
        return existing
    count = await db.scalar(select(func.count()).select_from(Mailbox).where(Mailbox.user_id == user.id)) or 0
    limit = PLANS.get(user.plan, PLANS["free"]).mailboxes
    if count >= limit:
        raise LimitReached(f"Your plan allows {limit} mailboxes")
    return None


@router.get("", response_model=list[MailboxOut])
async def list_mailboxes(user: CurrentUser, db: DB) -> list[Mailbox]:
    return list((await db.scalars(
        select(Mailbox).where(Mailbox.user_id == user.id).order_by(Mailbox.created_at))).all())


@router.get("/imap/presets", response_model=list[ImapPreset])
async def imap_presets() -> list[ImapPreset]:
    return [ImapPreset(id=key, **value) for key, value in PRESETS.items()]


async def _verify_imap(mailbox_id: UUID, address: str, credentials: ImapCredentials,
                       cursor: dict | None = None) -> dict:
    """Log in to IMAP (and SMTP when configured) before saving anything. Returns the starting cursor."""
    creds = credentials.model_dump()
    try:
        async with get_provider(Provider.imap).open(mailbox_id, address, creds) as session:
            _, new_cursor = await session.fetch_new(cursor or {})
    except ReauthRequired as exc:
        raise AppError(str(exc), code="imap_login_failed", status=422) from exc
    except (ProviderError, OSError, TimeoutError) as exc:
        raise AppError(f"Could not connect: {exc}", code="imap_unreachable", status=422) from exc
    if credentials.smtp_host:
        try:
            await verify_smtp(credentials)
        except SendError as exc:
            raise AppError(str(exc), code="smtp_failed", status=422) from exc
    return new_cursor


@router.post("/imap", response_model=MailboxOut, status_code=201)
async def connect_imap(body: ImapMailboxCreate, user: CurrentUser, db: DB) -> Mailbox:
    address = body.address.strip().lower()
    if await _check_limit(db, user, address, Provider.imap):
        raise Conflict("This mailbox is already connected")
    mailbox_id = uuid7()
    cursor = await _verify_imap(mailbox_id, address, body.credentials)
    mailbox = Mailbox(
        id=mailbox_id, user_id=user.id, provider=Provider.imap, address=address,
        display_name=body.display_name, credentials=vault().encrypt_json(body.credentials.model_dump()),
        sync_cursor=cursor, last_synced_at=datetime.now(UTC), can_send=bool(body.credentials.smtp_host),
    )
    db.add(mailbox)
    await db.commit()
    return mailbox


@router.post("/gmail/authorize", response_model=AuthorizeOut)
async def gmail_authorize(
    user: CurrentUser, db: DB, login_hint: str | None = None,
    send: bool = Query(False, description="Also ask for permission to send email (WhatsApp /email)"),
) -> AuthorizeOut:
    if not (await google_config()).oauth_ready:
        raise AppError("Gmail is not configured on this server", code="gmail_not_configured", status=503)
    count = await db.scalar(select(func.count()).select_from(Mailbox).where(Mailbox.user_id == user.id)) or 0
    reconnecting = bool(login_hint) and await db.scalar(select(Mailbox.id).where(
        Mailbox.user_id == user.id, Mailbox.provider == Provider.gmail, Mailbox.address == login_hint.lower()))
    if not reconnecting and count >= PLANS.get(user.plan, PLANS["free"]).mailboxes:
        raise LimitReached("Mailbox limit reached for your plan")
    state, verifier = new_opaque_token(), new_opaque_token() + new_opaque_token()
    await get_redis().set(Keys.oauth_state(state), json.dumps({"user_id": str(user.id), "verifier": verifier}),
                          ex=OAUTH_STATE_TTL_S)
    return AuthorizeOut(url=await gmail_api.authorize_url(state, verifier, login_hint, send=send))


def _back_to_app(**params: str) -> RedirectResponse:
    base = get_settings().public_web_url.rstrip("/")
    return RedirectResponse(f"{base}/mailboxes?{urlencode(params)}", status_code=303)


@oauth_router.get("/google/callback", include_in_schema=False)
async def gmail_callback(
    db: DB, state: str = Query(...), code: str | None = Query(None), error: str | None = Query(None)
) -> RedirectResponse:
    raw = await get_redis().getdel(Keys.oauth_state(state))
    if raw is None:
        return _back_to_app(error="The sign-in link expired. Try connecting again.")
    if error or not code:
        return _back_to_app(error="Google access was not granted.")
    data = json.loads(raw)
    user = await db.get(User, UUID(data["user_id"]))
    if user is None:
        return _back_to_app(error="Account not found.")
    try:
        tokens = await gmail_api.exchange_code(code, data["verifier"])
        session = gmail_api.GmailSession(uuid7(), "", tokens)
        profile = await session.profile()
        address = profile["emailAddress"].lower()
        existing = await _check_limit(db, user, address, Provider.gmail)
        if existing and not tokens.get("refresh_token"):
            tokens["refresh_token"] = vault().decrypt_json(existing.credentials).get("refresh_token")
        mailbox = existing or Mailbox(id=uuid7(), user_id=user.id, provider=Provider.gmail, address=address)
        session = gmail_api.GmailSession(mailbox.id, address, tokens)
        watch = await session.watch()
        mailbox.sync_cursor = {"history_id": watch["history_id"] if watch else str(profile["historyId"])}
        mailbox.watch_expires_at = watch["expires_at"] if watch else None
        mailbox.credentials = vault().encrypt_json(session.credentials)
        mailbox.can_send = gmail_api.can_send(session.credentials)
        mailbox.status = MailboxStatus.active
        mailbox.last_error = None
        mailbox.error_count = 0
        mailbox.last_synced_at = datetime.now(UTC)
        if existing is None:
            db.add(mailbox)
        await db.commit()
    except LimitReached as exc:
        return _back_to_app(error=exc.detail)
    except ProviderError as exc:
        log.warning("gmail_connect_failed", error=str(exc))
        return _back_to_app(error=str(exc))
    return _back_to_app(connected=address)


@router.patch("/{mailbox_id}", response_model=MailboxOut)
async def update_mailbox(mailbox_id: UUID, body: MailboxUpdate, user: CurrentUser, db: DB) -> Mailbox:
    mailbox = await _get(db, user.id, mailbox_id)
    if body.display_name is not None:
        mailbox.display_name = body.display_name or None
    if body.paused is True:
        mailbox.status = MailboxStatus.paused
    elif body.paused is False and mailbox.status == MailboxStatus.paused:
        mailbox.status = MailboxStatus.active
    await db.commit()
    return mailbox


@router.post("/{mailbox_id}/sync", status_code=202, response_model=SyncQueued)
async def sync_now(mailbox_id: UUID, user: CurrentUser, db: DB) -> SyncQueued:
    mailbox = await _get(db, user.id, mailbox_id)
    if mailbox.status in (MailboxStatus.paused, MailboxStatus.reauth_required):
        raise AppError(f"Mailbox is {mailbox.status.value.replace('_', ' ')}", code="mailbox_inactive")
    if mailbox.status == MailboxStatus.error:
        mailbox.status = MailboxStatus.active
        await db.commit()
    return SyncQueued(queued=await request_sync(mailbox.id))


@router.get("/{mailbox_id}/connection", response_model=ImapConnectionOut)
async def imap_connection(mailbox_id: UUID, user: CurrentUser, db: DB) -> ImapConnectionOut:
    """Current server settings of an IMAP mailbox (no passwords), to prefill the update form."""
    mailbox = await _get(db, user.id, mailbox_id)
    if mailbox.provider != Provider.imap:
        raise AppError("Only IMAP mailboxes have server settings", code="wrong_provider")
    creds = ImapCredentials.model_validate(vault().decrypt_json(mailbox.credentials))
    return ImapConnectionOut(
        host=creds.host, port=creds.port, security=creds.security, username=creds.username, folder=creds.folder,
        smtp_host=creds.smtp_host, smtp_port=creds.smtp_port, smtp_security=creds.smtp_security,
        smtp_username=creds.smtp_username, has_smtp_password=bool(creds.smtp_password),
    )


@router.put("/{mailbox_id}/credentials", response_model=MailboxOut)
async def update_imap_credentials(
    mailbox_id: UUID, body: ImapCredentialsUpdate, user: CurrentUser, db: DB
) -> Mailbox:
    """Fix an IMAP mailbox that needs re-authentication (new app password, host, ...). Keeps its history."""
    mailbox = await _get(db, user.id, mailbox_id)
    if mailbox.provider != Provider.imap:
        raise AppError("Reconnect Gmail mailboxes through Google", code="wrong_provider")
    saved = vault().decrypt_json(mailbox.credentials)
    patch = body.credentials
    merged = patch.model_dump()
    merged["password"] = patch.password or saved.get("password")
    if not merged["password"]:
        raise AppError("Enter the app password", code="password_required", status=422)
    if patch.smtp_host:
        merged["smtp_password"] = patch.smtp_password or saved.get("smtp_password")
    else:
        merged.update(smtp_host=None, smtp_username=None, smtp_password=None)
    credentials = ImapCredentials.model_validate(merged)
    cursor = await _verify_imap(mailbox.id, mailbox.address, credentials, mailbox.sync_cursor)
    mailbox.credentials = vault().encrypt_json(credentials.model_dump())
    mailbox.can_send = bool(credentials.smtp_host)
    if not mailbox.sync_cursor:
        mailbox.sync_cursor = cursor
    mailbox.status = MailboxStatus.active
    mailbox.last_error = None
    mailbox.error_count = 0
    await db.commit()
    return mailbox


@router.delete("/{mailbox_id}", status_code=204)
async def delete_mailbox(mailbox_id: UUID, user: CurrentUser, db: DB) -> None:
    mailbox = await _get(db, user.id, mailbox_id)
    shared = await db.scalar(select(func.count()).select_from(Mailbox).where(
        Mailbox.provider == mailbox.provider, Mailbox.address == mailbox.address, Mailbox.id != mailbox.id))
    # Watches and grants are per Google account: keep them if another user still connects this address.
    if mailbox.provider == Provider.gmail and not shared:
        creds = vault().decrypt_json(mailbox.credentials)
        try:
            await gmail_api.GmailSession(mailbox.id, mailbox.address, creds).stop_watch()
        except ProviderError:
            pass
        await gmail_api.revoke(creds)
    await db.delete(mailbox)
    await db.commit()
