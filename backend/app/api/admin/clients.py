"""Manage clients and everything they own: mailboxes, rules, alerts."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import Select, delete, func, or_, select, update

from app.api.admin.schemas import (
    AdminMailboxRow,
    AdminRuleRow,
    AdminRuleUpdate,
    ClientCreate,
    ClientDetail,
    ClientMessageRow,
    ClientPage,
    ClientRow,
    ClientUpdate,
    SendToClient,
)
from app.api.deps import DB, AdminUser, client_ip
from app.api.routes.messages import notification_out
from app.core.config import PLANS
from app.core.db import uuid7
from app.core.errors import AppError, Conflict, NotFound
from app.core.security import normalize_phone, phone_to_chat_id
from app.models import (
    Destination,
    DestinationKind,
    Event,
    EventStatus,
    Mailbox,
    MailboxStatus,
    Message,
    Notification,
    NotificationKind,
    OutboundEmail,
    OutboundStatus,
    RefreshToken,
    Rule,
    User,
    UserSettings,
)
from app.services import admin_auth, outbox
from app.services.events import wake_dispatcher
from app.services.ingest import request_sync
from app.services.rulesets import bump_version
from app.services.schedule import tz

router = APIRouter(prefix="/admin", tags=["admin"])


async def _client(db: DB, client_id: UUID) -> User:
    user = await db.get(User, client_id)
    if user is None:
        raise NotFound("Client not found")
    return user


async def _rows(db: DB, users: list[User]) -> list[ClientRow]:
    ids = [u.id for u in users]
    if not ids:
        return []
    week = datetime.now(UTC) - timedelta(days=7)
    mb = dict((await db.execute(select(Mailbox.user_id, func.count()).where(Mailbox.user_id.in_(ids))
                                .group_by(Mailbox.user_id))).all())
    problems = dict((await db.execute(select(Mailbox.user_id, func.count()).where(
        Mailbox.user_id.in_(ids), Mailbox.status.in_([MailboxStatus.error, MailboxStatus.reauth_required]))
        .group_by(Mailbox.user_id))).all())
    rules = dict((await db.execute(select(Rule.user_id, func.count()).where(Rule.user_id.in_(ids))
                                   .group_by(Rule.user_id))).all())
    matched = dict((await db.execute(select(Message.user_id, func.count()).where(
        Message.user_id.in_(ids), Message.created_at >= week).group_by(Message.user_id))).all())
    return [ClientRow.model_validate(u).model_copy(update={
        "mailboxes": mb.get(u.id, 0), "rules": rules.get(u.id, 0), "matched_7d": matched.get(u.id, 0),
        "problems": problems.get(u.id, 0)}) for u in users]


@router.get("/clients", response_model=ClientPage)
async def list_clients(
    _: AdminUser, db: DB, q: str | None = None, status: str | None = Query(None, pattern="^(active|disabled)$"),
    plan: str | None = None, offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100),
) -> ClientPage:
    stmt: Select = select(User)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.phone_e164.ilike(like), User.display_name.ilike(like), User.email.ilike(like)))
    if status:
        stmt = stmt.where(User.is_active.is_(status == "active"))
    if plan:
        stmt = stmt.where(User.plan == plan)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    users = list((await db.scalars(stmt.order_by(User.created_at.desc()).offset(offset).limit(limit))).all())
    return ClientPage(items=await _rows(db, users), total=total)


@router.post("/clients", response_model=ClientRow, status_code=201)
async def create_client(body: ClientCreate, admin: AdminUser, db: DB, request: Request) -> ClientRow:
    phone = normalize_phone(body.phone)
    if phone is None:
        raise AppError("Enter a valid phone number with country code", code="invalid_phone", status=422)
    if body.plan not in PLANS:
        raise AppError(f"Unknown plan; use one of {', '.join(PLANS)}", code="invalid_plan", status=422)
    if await db.scalar(select(User.id).where(User.phone_e164 == phone)):
        raise Conflict("A client with this number already exists")
    user = User(id=uuid7(), phone_e164=phone, display_name=body.display_name, plan=body.plan)
    db.add(user)
    await db.flush()
    db.add(UserSettings(user_id=user.id, quiet_hours={"enabled": False, "start": "23:00", "end": "07:00"},
                        digest={"enabled": False, "time": "08:00"}))
    db.add(Destination(id=uuid7(), user_id=user.id, kind=DestinationKind.whatsapp_self, chat_id=phone_to_chat_id(phone),
                       label="My WhatsApp", verified_at=datetime.now(UTC), is_default=True))
    await admin_auth.record(db, admin, "client.created", target_type="client", target_id=user.id,
                            details={"phone": phone}, ip=client_ip(request))
    await db.commit()
    return (await _rows(db, [user]))[0]


@router.get("/clients/{client_id}", response_model=ClientDetail)
async def client_detail(client_id: UUID, _: AdminUser, db: DB) -> ClientDetail:
    user = await _client(db, client_id)
    prefs = await db.get(UserSettings, user.id)
    mailboxes = (await db.scalars(select(Mailbox).where(Mailbox.user_id == user.id).order_by(Mailbox.created_at))
                 ).all()
    rules = (await db.scalars(select(Rule).where(Rule.user_id == user.id).order_by(Rule.position))).all()
    destinations = (await db.scalars(select(Destination).where(Destination.user_id == user.id))).all()
    messages = (await db.scalars(select(Message).where(Message.user_id == user.id)
                                 .order_by(Message.received_at.desc()).limit(10))).all()
    notes = (await db.scalars(select(Notification).where(Notification.user_id == user.id)
                              .order_by(Notification.created_at.desc()).limit(15))).all()
    counts = dict((await db.execute(select(Notification.status, func.count()).where(
        Notification.user_id == user.id).group_by(Notification.status))).all())
    emails = await db.scalar(select(func.count()).select_from(OutboundEmail).where(
        OutboundEmail.user_id == user.id, OutboundEmail.status == OutboundStatus.sent)) or 0
    upcoming = await db.scalar(select(func.count()).select_from(Event).where(
        Event.user_id == user.id, Event.status == EventStatus.upcoming, Event.starts_at >= datetime.now(UTC))) or 0
    settings = {}
    if prefs:
        settings = {"quiet_hours": prefs.quiet_hours, "digest": prefs.digest, "daily_cap": prefs.daily_cap,
                    "compose_enabled": prefs.compose_enabled, "weekly_recap": prefs.weekly_recap,
                    "deadlines_enabled": prefs.deadlines_enabled, "muted_senders": prefs.muted_senders}
    owner = {"owner_phone": user.phone_e164, "owner_name": user.display_name}
    return ClientDetail(
        client=(await _rows(db, [user]))[0], settings=settings,
        mailboxes=[AdminMailboxRow.model_validate(m).model_copy(update=owner) for m in mailboxes],
        rules=[AdminRuleRow.model_validate(r).model_copy(update=owner) for r in rules],
        destinations=[{"id": str(d.id), "kind": d.kind.value, "label": d.label, "chat_id": d.chat_id,
                       "verified": d.verified_at is not None, "is_default": d.is_default} for d in destinations],
        recent_messages=[ClientMessageRow.model_validate(m) for m in messages],
        recent_notifications=[notification_out(n) for n in notes],
        notification_counts={str(k): v for k, v in counts.items()}, emails_sent=emails, upcoming_events=upcoming,
    )


@router.patch("/clients/{client_id}", response_model=ClientRow)
async def update_client(client_id: UUID, body: ClientUpdate, admin: AdminUser, db: DB, request: Request
                        ) -> ClientRow:
    user = await _client(db, client_id)
    data = body.model_dump(exclude_unset=True)
    if "plan" in data and data["plan"] not in PLANS:
        raise AppError(f"Unknown plan; use one of {', '.join(PLANS)}", code="invalid_plan", status=422)
    if "timezone" in data and data["timezone"] and tz(data["timezone"]).key != data["timezone"]:
        raise AppError("Unknown timezone", code="invalid_timezone", status=422)
    for key, value in data.items():
        setattr(user, key, value)
    if data.get("is_active") is False:  # disabling also signs the client out everywhere
        await db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
                         .values(revoked_at=datetime.now(UTC)))
    await admin_auth.record(db, admin, "client.updated", target_type="client", target_id=user.id, details=data,
                            ip=client_ip(request))
    await db.commit()
    return (await _rows(db, [user]))[0]


@router.delete("/clients/{client_id}", status_code=204)
async def delete_client(client_id: UUID, admin: AdminUser, db: DB, request: Request) -> None:
    """Deletes the client and everything they own (mailboxes, rules, matched mail, alerts)."""
    user = await _client(db, client_id)
    await admin_auth.record(db, admin, "client.deleted", target_type="client", target_id=user.id,
                            details={"phone": user.phone_e164}, ip=client_ip(request))
    await db.delete(user)
    await db.commit()


@router.post("/clients/{client_id}/sign-out", status_code=204)
async def sign_out_client(client_id: UUID, admin: AdminUser, db: DB, request: Request) -> None:
    user = await _client(db, client_id)
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
                     .values(revoked_at=datetime.now(UTC)))
    await admin_auth.record(db, admin, "client.signed_out", target_type="client", target_id=user.id,
                            ip=client_ip(request))
    await db.commit()


@router.post("/clients/{client_id}/message", status_code=202)
async def message_client(client_id: UUID, body: SendToClient, admin: AdminUser, db: DB, request: Request
                         ) -> dict[str, bool]:
    """Send a WhatsApp message to the client's own number (through the normal queue)."""
    user = await _client(db, client_id)
    destination = await outbox.default_destination(db, user.id)
    if destination is None:
        raise AppError("This client has no verified WhatsApp destination", code="no_destination", status=422)
    await outbox.enqueue(db, user_id=user.id, destination=destination, kind=NotificationKind.system,
                         payload={"text": body.text}, dedupe=f"admin-msg:{uuid7()}")
    await admin_auth.record(db, admin, "client.messaged", target_type="client", target_id=user.id,
                            details={"length": len(body.text)}, ip=client_ip(request))
    await db.commit()
    await wake_dispatcher()
    return {"queued": True}


# ---------------------------------------------------------------- mailboxes


async def _owners(db: DB, user_ids: set[UUID]) -> dict[UUID, tuple[str, str | None]]:
    if not user_ids:
        return {}
    rows = (await db.execute(select(User.id, User.phone_e164, User.display_name).where(User.id.in_(user_ids)))).all()
    return {uid: (phone, name) for uid, phone, name in rows}


async def _with_owner(db: DB, rows: list, model: type) -> list:
    owners = await _owners(db, {r.user_id for r in rows})
    return [model.model_validate(r).model_copy(update={
        "owner_phone": owners.get(r.user_id, ("", None))[0], "owner_name": owners.get(r.user_id, ("", None))[1]})
        for r in rows]


@router.get("/mailboxes", response_model=list[AdminMailboxRow])
async def list_mailboxes(
    _: AdminUser, db: DB, status: MailboxStatus | None = None, q: str | None = None,
    limit: int = Query(200, ge=1, le=500),
) -> list[AdminMailboxRow]:
    stmt = select(Mailbox).order_by(Mailbox.created_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(Mailbox.status == status)
    if q:
        stmt = stmt.where(Mailbox.address.ilike(f"%{q.strip()}%"))
    rows = (await db.scalars(stmt)).all()
    owners = await _owners(db, {m.user_id for m in rows})
    return [AdminMailboxRow.model_validate(m).model_copy(update={
        "owner_phone": owners.get(m.user_id, ("", None))[0], "owner_name": owners.get(m.user_id, ("", None))[1]})
        for m in rows]


@router.post("/mailboxes/{mailbox_id}/{action}", response_model=AdminMailboxRow)
async def mailbox_action(mailbox_id: UUID, action: str, admin: AdminUser, db: DB, request: Request
                         ) -> AdminMailboxRow:
    mailbox = await db.get(Mailbox, mailbox_id)
    if mailbox is None:
        raise NotFound("Mailbox not found")
    match action:
        case "sync":
            if mailbox.status in (MailboxStatus.error,):
                mailbox.status = MailboxStatus.active
        case "pause":
            mailbox.status = MailboxStatus.paused
        case "resume":
            mailbox.status = MailboxStatus.active
            mailbox.error_count = 0
        case _:
            raise NotFound("Unknown action; use sync, pause or resume")
    await admin_auth.record(db, admin, f"mailbox.{action}", target_type="mailbox", target_id=mailbox.id,
                            details={"address": mailbox.address}, ip=client_ip(request))
    await db.commit()
    if action in ("sync", "resume"):
        await request_sync(mailbox.id)
    return (await _with_owner(db, [mailbox], AdminMailboxRow))[0]


@router.delete("/mailboxes/{mailbox_id}", status_code=204)
async def delete_mailbox(mailbox_id: UUID, admin: AdminUser, db: DB, request: Request) -> None:
    mailbox = await db.get(Mailbox, mailbox_id)
    if mailbox is None:
        raise NotFound("Mailbox not found")
    await admin_auth.record(db, admin, "mailbox.deleted", target_type="mailbox", target_id=mailbox.id,
                            details={"address": mailbox.address}, ip=client_ip(request))
    await db.delete(mailbox)
    await db.commit()


# ---------------------------------------------------------------- rules


@router.get("/rules", response_model=list[AdminRuleRow])
async def list_rules(
    _: AdminUser, db: DB, q: str | None = None, client_id: UUID | None = None,
    limit: int = Query(300, ge=1, le=1000),
) -> list[AdminRuleRow]:
    stmt = select(Rule).order_by(Rule.created_at.desc()).limit(limit)
    if q:
        stmt = stmt.where(Rule.name.ilike(f"%{q.strip()}%"))
    if client_id:
        stmt = stmt.where(Rule.user_id == client_id)
    rows = (await db.scalars(stmt)).all()
    owners = await _owners(db, {r.user_id for r in rows})
    return [AdminRuleRow.model_validate(r).model_copy(update={
        "owner_phone": owners.get(r.user_id, ("", None))[0], "owner_name": owners.get(r.user_id, ("", None))[1]})
        for r in rows]


@router.patch("/rules/{rule_id}", response_model=AdminRuleRow)
async def update_rule(rule_id: UUID, body: AdminRuleUpdate, admin: AdminUser, db: DB, request: Request
                      ) -> AdminRuleRow:
    rule = await db.get(Rule, rule_id)
    if rule is None:
        raise NotFound("Rule not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    await admin_auth.record(db, admin, "rule.updated", target_type="rule", target_id=rule.id,
                            details=body.model_dump(exclude_unset=True), ip=client_ip(request))
    await db.commit()
    await bump_version(rule.user_id)
    return (await _with_owner(db, [rule], AdminRuleRow))[0]


@router.get("/rules/{rule_id}", response_model=AdminRuleRow)
async def get_rule(rule_id: UUID, _: AdminUser, db: DB) -> AdminRuleRow:
    rule = await db.get(Rule, rule_id)
    if rule is None:
        raise NotFound("Rule not found")
    return (await _with_owner(db, [rule], AdminRuleRow))[0]


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: UUID, admin: AdminUser, db: DB, request: Request) -> None:
    rule = await db.get(Rule, rule_id)
    if rule is None:
        raise NotFound("Rule not found")
    user_id = rule.user_id
    await admin_auth.record(db, admin, "rule.deleted", target_type="rule", target_id=rule.id,
                            details={"name": rule.name}, ip=client_ip(request))
    await db.execute(delete(Rule).where(Rule.id == rule.id))
    await db.commit()
    await bump_version(user_id)
