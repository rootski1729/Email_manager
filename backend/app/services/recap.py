"""Weekly recap on WhatsApp (Sunday evening, user's timezone): what MailSentinel caught and what's coming up."""

from collections import Counter
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import session_factory
from app.core.logging import log
from app.models import (
    Event,
    EventStatus,
    Mailbox,
    Message,
    NotificationKind,
    OutboundEmail,
    OutboundStatus,
    RuleMatch,
    User,
    UserSettings,
)
from app.notify.templates import EVENT_ICONS, when_text
from app.services import events, outbox
from app.services.schedule import tz

RECAP_WEEKDAY = 6  # Sunday
RECAP_AT = time(18, 0)


def recap_due(timezone: str, last_sent: datetime | None, now: datetime) -> bool:
    local = now.astimezone(tz(timezone))
    if local.weekday() != RECAP_WEEKDAY or local.time() < RECAP_AT:
        return False
    return last_sent is None or now - last_sent > timedelta(days=6)


async def build_recap(db: AsyncSession, user: User, now: datetime) -> str | None:
    since = now - timedelta(days=7)
    messages = (await db.scalars(select(Message).where(Message.user_id == user.id, Message.created_at >= since)
                                 .order_by(Message.received_at.desc()))).all()
    stats = await events.daily_stats(user.id, 7)
    scanned = sum(d["scanned"] for d in stats)
    sent_emails = await db.scalar(select(func.count()).select_from(OutboundEmail).where(
        OutboundEmail.user_id == user.id, OutboundEmail.status == OutboundStatus.sent,
        OutboundEmail.sent_at >= since)) or 0
    upcoming = (await db.scalars(select(Event).where(
        Event.user_id == user.id, Event.status == EventStatus.upcoming,
        Event.starts_at >= now, Event.starts_at <= now + timedelta(days=7)).order_by(Event.starts_at).limit(6))).all()
    if not messages and not upcoming and not scanned:
        return None
    lines = ["📊 *Your week with MailSentinel*", ""]
    lines.append(f"📥 Scanned *{scanned}* new emails · ⭐ *{len(messages)}* were important")
    if messages:
        rules = Counter((await db.scalars(select(RuleMatch.rule_name).where(
            RuleMatch.message_id.in_([m.id for m in messages])))).all())
        senders = Counter(m.from_name or m.from_address for m in messages)
        lines.append("🏷️ Top rules: " + ", ".join(f"{name} ({n})" for name, n in rules.most_common(3)))
        lines.append("👤 Top senders: " + ", ".join(f"{name} ({n})" for name, n in senders.most_common(3)))
    if sent_emails:
        lines.append(f"✉️ You sent *{sent_emails}* email{'s' if sent_emails != 1 else ''} from WhatsApp")
    if upcoming:
        lines += ["", "📅 *Coming up this week*"]
        for e in upcoming:
            when = when_text({"starts_at": e.starts_at.isoformat(), "all_day": e.all_day}, user.timezone)
            lines.append(f"{EVENT_ICONS.get(e.kind.value, '📅')} {when} – {e.title[:80]}")
    if scanned and messages:
        quiet = max(scanned - len(messages), 0)
        lines += ["", f"_I kept {quiet} other emails out of your way._"]
    lines += ["", f"Details: {get_settings().public_web_url.rstrip('/')}/dashboard · Turn off in Settings"]
    return "\n".join(lines)


async def send_due_recaps(now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    sent = 0
    async with session_factory()() as db:
        rows = (await db.execute(
            select(User, UserSettings).join(UserSettings, UserSettings.user_id == User.id)
            .where(User.is_active.is_(True), UserSettings.weekly_recap.is_(True))
            .where(select(Mailbox.id).where(Mailbox.user_id == User.id).exists())
        )).all()
        for user, prefs in rows:
            if not recap_due(user.timezone, prefs.last_recap_at, now):
                continue
            try:
                text = await build_recap(db, user, now)
            except Exception:  # one user's recap must not block the rest
                log.exception("recap_failed", user_id=str(user.id))
                continue
            prefs.last_recap_at = now
            destination = await outbox.default_destination(db, user.id)
            if text and destination:
                week = now.astimezone(tz(user.timezone)).strftime("%G-W%V")
                sent += await outbox.enqueue(db, user_id=user.id, destination=destination,
                                             kind=NotificationKind.recap, payload={"text": text},
                                             dedupe=f"recap:{user.id}:{week}")
        await db.commit()
    if sent:
        await events.wake_dispatcher()
    return sent
