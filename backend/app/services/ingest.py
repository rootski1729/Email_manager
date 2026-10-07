"""Mailbox sync: fetch new mail, run rules, record matches and queue alerts in one transaction."""

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from redis.exceptions import LockError
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.client import AIUnavailable
from app.ai.features import Summary, summarize
from app.compose.commands import encode_ref
from app.core.config import get_settings
from app.core.db import session_factory, uuid7
from app.core.logging import log
from app.core.redis import Keys, get_redis
from app.core.runtime import ai_config
from app.core.security import vault
from app.models import Mailbox, MailboxStatus, Message, NotificationKind, Rule, RuleMatch, User, UserSettings
from app.providers import get_provider
from app.providers.base import ProviderError, ReauthRequired
from app.providers.mime import readable_preview
from app.providers.reading import read_email
from app.rules.engine import CompiledRule
from app.rules.envelope import Envelope, domain_of
from app.services import deadlines, events, outbox
from app.services.rulesets import load_ruleset

SEEN_TTL_S = 7 * 24 * 3600
PENDING_TTL_S = 300
LOCK_TTL_S = 300
ERRORS_BEFORE_ERROR_STATUS = 10

# Set by the worker module so that services don't import task definitions.
kick_sync: Callable[[str], Awaitable[None]] | None = None


async def request_sync(mailbox_id: UUID | str) -> bool:
    """Ask for a sync. Bursts collapse into one queued job per mailbox."""
    redis = get_redis()
    if not await redis.set(Keys.sync_pending(mailbox_id), "1", nx=True, ex=PENDING_TTL_S):
        return False
    if kick_sync is None:
        raise RuntimeError("task queue is not configured in this process")
    await kick_sync(str(mailbox_id))
    return True


@dataclass
class SyncContext:
    """Per-sync user data, loaded once instead of per message."""

    user: User
    muted: list[str]
    deadlines: bool
    ai: bool


async def load_context(db: AsyncSession, user_id: UUID) -> SyncContext | None:
    user = await db.get(User, user_id)
    if user is None:
        return None
    prefs = await db.get(UserSettings, user_id)
    ai = (prefs.ai_enabled if prefs else True) and (await ai_config()).ready
    return SyncContext(user=user, muted=[m.lower() for m in (prefs.muted_senders if prefs else []) or []],
                       deadlines=prefs.deadlines_enabled if prefs else True, ai=ai)


async def summarize_safe(env: Envelope) -> Summary | None:
    """AI summary for the alert; never blocks or breaks the alert itself."""
    try:
        return await asyncio.wait_for(summarize(
            subject=env.subject, sender=f"{env.from_name} <{env.from_address}>".strip(),
            body=env.body_text or env.snippet), timeout=30)
    except (AIUnavailable, TimeoutError):
        return None
    except Exception:  # a bug in the AI path must never lose the alert
        log.exception("ai_summary_failed")
        return None


def is_muted(address: str, muted: list[str]) -> bool:
    address = address.lower()
    domain = domain_of(address)
    for entry in muted:
        if "@" in entry:
            if address == entry:
                return True
        elif domain == entry or domain.endswith("." + entry):
            return True
    return False


async def next_ref(db: AsyncSession, user_id: UUID) -> str:
    """Per-user short code. Seeded from the database if Redis lost the counter."""
    redis = get_redis()
    key = Keys.ref_seq(user_id)
    n = await redis.incr(key)
    if n == 1:
        existing = await db.scalar(select(func.count()).select_from(Message).where(Message.user_id == user_id)) or 0
        if existing:
            n = await redis.incrby(key, existing)
    return encode_ref(n)


def alert_payload(mailbox: Mailbox, env: Envelope, rules: list[CompiledRule], message_id: UUID) -> dict:
    return {
        "message_id": str(message_id),
        "mailbox_address": mailbox.address,
        "from_name": env.from_name,
        "from_address": env.from_address,
        "subject": env.subject,
        "snippet": env.snippet,
        "rules": [r.name for r in rules],
        "web_url": env.web_url,
        "received_at": env.received_at.isoformat(),
    }


async def record_match(
    db: AsyncSession, mailbox: Mailbox, env: Envelope, matched: list[CompiledRule],
    ctx: SyncContext | None = None, summary: Summary | None = None,
) -> dict[str, Any] | None:
    """Insert the message, its rule matches, detected dates and outbox rows. Idempotent per (mailbox, message)."""
    settings = get_settings()
    ctx = ctx or await load_context(db, mailbox.user_id)
    message_id = uuid7()
    ref = await next_ref(db, mailbox.user_id)
    reading = read_email(env.body_text, subject=env.subject, in_reply_to=bool(env.header("in-reply-to"))) \
        if env.body_text else None
    preview = (readable_preview(reading.main_text, settings.alert_preview_chars) if reading else "") or \
        (env.snippet or "")[: settings.alert_preview_chars]
    inserted = await db.scalar(
        insert(Message).values(
            id=message_id, user_id=mailbox.user_id, mailbox_id=mailbox.id,
            provider_message_id=env.provider_message_id, thread_id=env.thread_id,
            from_address=env.from_address[:320], from_name=(env.from_name or None) and env.from_name[:320],
            to_addresses=[*env.to, *env.cc][:50], subject=env.subject,
            snippet=preview or None, ai_summary=summary.summary if summary else None,
            ai_action=summary.action if summary else None,
            received_at=env.received_at, list_id=(env.list_id or None) and env.list_id[:320],
            has_attachments=bool(env.attachments), web_url=env.web_url, ref=ref,
            headers={k: v for k, v in env.headers.items() if k in KEPT_HEADERS},
        ).on_conflict_do_nothing(index_elements=["mailbox_id", "provider_message_id"]).returning(Message.id)
    )
    if inserted is None:
        return None

    live_rules = set((await db.scalars(
        select(Rule.id).where(Rule.id.in_([r.id for r in matched]))
    )).all())
    now = datetime.now(UTC)
    for rule in matched:
        db.add(RuleMatch(id=uuid7(), message_id=message_id, rule_id=rule.id if rule.id in live_rules else None,
                         rule_name=rule.name))
    if live_rules:
        await db.execute(
            update(Rule).where(Rule.id.in_(live_rules))
            .values(match_count=Rule.match_count + 1, last_matched_at=now)
        )

    destination_ids: set[UUID] = set()
    instant = urgent = False
    notify_rules = [r for r in matched if (r.actions or {}).get("notify", {}) is not None]
    for rule in notify_rules:
        notify = (rule.actions or {}).get("notify") or {}
        destination_ids |= {UUID(str(d)) for d in notify.get("destinations", [])}
        urgent |= bool(notify.get("urgent"))
        instant |= notify.get("mode", "instant") == "instant" or bool(notify.get("urgent"))
    payload = alert_payload(mailbox, env, matched, message_id)
    payload["snippet"] = preview
    payload["attachments"] = [{"name": a.name, "type": a.mime_type, "size": a.size} for a in env.attachments[:20]]
    if reading and reading.kind != "new":
        payload["thread"] = {"kind": reading.kind, "earlier": reading.earlier,
                             "forwarded_from": reading.forwarded_from,
                             "note": readable_preview(reading.latest, 200) if reading.kind == "forward" else ""}
    if summary:
        payload["ai"] = {"summary": summary.summary, "action": summary.action, "importance": summary.importance}
    payload["ref"] = ref
    payload["urgent"] = urgent
    if ctx is not None:
        payload["timezone"] = ctx.user.timezone
        if ctx.deadlines:
            try:
                found = deadlines.detect(env, ctx.user.timezone)
                stored = await deadlines.store_found(db, ctx.user, message_id, found, ref=ref)
            except Exception:
                log.exception("deadline_detection_failed", message_id=str(message_id))
                stored = []
            payload["events"] = [deadlines.event_brief(e) for e in stored]
        if is_muted(env.from_address, ctx.muted):
            payload["muted"] = True
            return payload
    if notify_rules:
        for destination in await outbox.resolve_destinations(db, mailbox.user_id, destination_ids):
            await outbox.enqueue(
                db, user_id=mailbox.user_id, destination=destination, kind=NotificationKind.alert,
                payload=payload, dedupe=f"alert:{mailbox.id}:{env.provider_message_id}",
                message_id=message_id, hold_for_digest=not instant, delay_s=settings.coalesce_window_s,
            )
    return payload


KEPT_HEADERS = {"from", "to", "cc", "reply-to", "subject", "date", "list-id", "message-id"}


async def _mark_failure(mailbox_id: UUID, exc: Exception) -> None:
    async with session_factory()() as db:
        mailbox = await db.get(Mailbox, mailbox_id)
        if mailbox is None:
            return
        mailbox.last_error = str(exc)[:500]
        mailbox.error_count += 1
        if isinstance(exc, ReauthRequired):
            mailbox.status = MailboxStatus.reauth_required
            await outbox.enqueue_system(
                db, mailbox.user_id,
                f"⚠️ MailSentinel can no longer read {mailbox.address}. Reconnect it in the app: "
                f"{get_settings().public_web_url.rstrip('/')}/mailboxes",
                dedupe=f"reauth:{mailbox.id}:{datetime.now(UTC):%Y%m%d}",
            )
        elif mailbox.error_count >= ERRORS_BEFORE_ERROR_STATUS:
            mailbox.status = MailboxStatus.error
        await db.commit()
        await events.publish(mailbox.user_id, "mailbox.updated", {
            "id": str(mailbox.id), "status": mailbox.status, "last_error": mailbox.last_error,
        })
    await events.wake_dispatcher()


async def sync_mailbox(mailbox_id: UUID) -> dict[str, Any]:
    redis = get_redis()
    lock = redis.lock(Keys.mailbox_lock(mailbox_id), timeout=LOCK_TTL_S, blocking=False)
    if not await lock.acquire():
        # Another worker is syncing; it will re-run because the pending flag stays set.
        return {"status": "locked"}
    try:
        await redis.delete(Keys.sync_pending(mailbox_id))
        result = await _sync_locked(mailbox_id)
    except (ProviderError, OSError, TimeoutError) as exc:
        log.warning("sync_failed", mailbox_id=str(mailbox_id), error=str(exc))
        await _mark_failure(mailbox_id, exc if isinstance(exc, ProviderError) else ProviderError(str(exc)))
        result = {"status": "error", "error": str(exc)}
    finally:
        try:
            await lock.release()
        except LockError:
            log.warning("sync_lock_expired", mailbox_id=str(mailbox_id))
    if await redis.exists(Keys.sync_pending(mailbox_id)) and kick_sync is not None:
        await kick_sync(str(mailbox_id))
    return result


async def _sync_locked(mailbox_id: UUID) -> dict[str, Any]:
    redis = get_redis()
    async with session_factory()() as db:
        mailbox = await db.get(Mailbox, mailbox_id)
        if mailbox is None or mailbox.status in (MailboxStatus.paused, MailboxStatus.reauth_required):
            return {"status": "skipped"}
        credentials = vault().decrypt_json(mailbox.credentials)
        ruleset = await load_ruleset(db, mailbox.user_id)
        ctx = await load_context(db, mailbox.user_id)
        matched_payloads: list[dict[str, Any]] = []
        new_refs: list[str] = []

        async with get_provider(mailbox.provider).open(mailbox.id, mailbox.address, credentials) as session:
            refs, cursor = await session.fetch_new(mailbox.sync_cursor or {})
            if refs:
                pipe = redis.pipeline(transaction=False)
                for ref in refs:
                    pipe.exists(Keys.seen(mailbox.id, ref))
                seen = await pipe.execute()
                new_refs = [ref for ref, was_seen in zip(refs, seen, strict=True) if not was_seen]
            needs_full = ruleset.needs_full(mailbox.id)
            for ref in new_refs if len(ruleset) else []:
                env = await session.load(ref, full=needs_full)
                if env is None:
                    continue
                matched = ruleset.evaluate(env)
                if not matched:
                    continue
                # Matched mail is read in full once: for the snippet and to find exam dates and invites.
                if not env.is_full and (not env.snippet or (ctx and ctx.deadlines)):
                    env = await session.load(ref, full=True) or env
                summary = await summarize_safe(env) if ctx and ctx.ai and not is_muted(env.from_address, ctx.muted) \
                    else None
                payload = await record_match(db, mailbox, env, matched, ctx, summary)
                if payload:
                    matched_payloads.append(payload)
            new_credentials = session.credentials

        mailbox.sync_cursor = cursor
        mailbox.last_synced_at = datetime.now(UTC)
        mailbox.last_error = None
        mailbox.error_count = 0
        if mailbox.status == MailboxStatus.error:
            mailbox.status = MailboxStatus.active
        mailbox.messages_scanned += len(new_refs)
        if new_credentials != credentials:
            mailbox.credentials = vault().encrypt_json(new_credentials)
        user_id = mailbox.user_id
        await db.commit()

    # Side effects only after the transaction is durable.
    if new_refs:
        pipe = redis.pipeline(transaction=False)
        for ref in new_refs:
            pipe.set(Keys.seen(mailbox_id, ref), "1", ex=SEEN_TTL_S)
        await pipe.execute()
    await events.bump(user_id, scanned=len(new_refs), matched=len(matched_payloads))
    for payload in matched_payloads:
        await events.publish(user_id, "message.matched", payload)
    await events.publish(user_id, "mailbox.updated", {"id": str(mailbox_id), "status": "active",
                                                      "last_synced_at": datetime.now(UTC).isoformat()})
    if matched_payloads:
        await events.wake_dispatcher()
    log.info("sync_done", mailbox_id=str(mailbox_id), scanned=len(new_refs), matched=len(matched_payloads))
    return {"status": "ok", "scanned": len(new_refs), "matched": len(matched_payloads)}
