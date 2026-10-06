"""Act on alerts from WhatsApp: /open, /reply, /remind, /mute, /recent, /upcoming.

Every alert carries a short per-user code (#K7). Commands take that code, or the user quotes the alert in
WhatsApp and types just the action ("remind 2h"), which the parser rewrites into the full command.
"""

import json
from datetime import UTC, datetime, timedelta
from email.utils import getaddresses
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.compose import commands as cmd
from app.compose.when import describe, parse_when
from app.core.config import get_settings
from app.core.redis import Keys, get_redis
from app.core.security import vault
from app.models import (
    Event,
    EventStatus,
    Mailbox,
    Message,
    Notification,
    NotificationKind,
    NotificationStatus,
    RuleMatch,
    User,
    UserSettings,
)
from app.notify.templates import EVENT_ICONS, when_text
from app.providers import get_provider
from app.providers.base import ProviderError, ReauthRequired
from app.rules.envelope import domain_of
from app.services import outbox
from app.services.schedule import tz

MAX_OPEN_CHARS = 3500
MAX_PENDING_REMINDERS = 50
MAX_MUTED = 200
DEFAULT_REMIND = "tomorrow 9am"


async def find_by_ref(db: AsyncSession, user_id: Any, token: str) -> Message | None:
    ref = cmd.normalize_ref(token)
    if ref is None:
        return None
    # Codes can repeat after a very long time; the newest message wins.
    return await db.scalar(select(Message).where(Message.user_id == user_id, Message.ref == ref)
                           .order_by(Message.created_at.desc()).limit(1))


async def message_payload(db: AsyncSession, message: Message, user: User) -> dict[str, Any]:
    mailbox_address = await db.scalar(select(Mailbox.address).where(Mailbox.id == message.mailbox_id))
    rules = (await db.scalars(select(RuleMatch.rule_name).where(RuleMatch.message_id == message.id))).all()
    return {"message_id": str(message.id), "mailbox_address": mailbox_address or "", "ref": message.ref,
            "from_name": message.from_name or "", "from_address": message.from_address, "subject": message.subject,
            "snippet": message.snippet or "", "rules": list(rules), "web_url": message.web_url,
            "timezone": user.timezone, "received_at": message.received_at.isoformat()}


def _split(arg: str) -> tuple[str, str]:
    first, _, rest = arg.strip().partition(" ")
    return first, rest.strip()


NO_CODE = ("I need the code from the alert, e.g. */{verb} K7*. "
           "Or quote (swipe right on) the alert and type *{verb}*.")


# ---------------------------------------------------------------- /open


async def on_open(db: AsyncSession, user: User, arg: str) -> list[str]:
    token, _ = _split(arg)
    message = await find_by_ref(db, user.id, token)
    if message is None:
        return [NO_CODE.format(verb="open") if not token else f"I can't find an alert with code *{token}*."]
    mailbox = await db.get(Mailbox, message.mailbox_id)
    if mailbox is None:
        return ["That mailbox is no longer connected."]
    try:
        creds = vault().decrypt_json(mailbox.credentials)
        async with get_provider(mailbox.provider).open(mailbox.id, mailbox.address, creds) as session:
            env = await session.load(message.provider_message_id, full=True)
    except ReauthRequired:
        return [f"I can't read {mailbox.address} right now: it needs to be reconnected in the app."]
    except (ProviderError, OSError, TimeoutError):
        return ["I couldn't reach your mailbox just now. Try again in a minute."]
    if env is None:
        return ["That email no longer exists in your mailbox (it may have been deleted)."]
    body = (env.body_text or env.snippet or "").strip()
    clipped = len(body) > MAX_OPEN_CHARS
    if clipped:
        body = body[:MAX_OPEN_CHARS].rstrip() + "…"
    head = [f"📖 *{env.subject or '(no subject)'}*  #{message.ref}",
            f"*From:* {env.from_name + ' ' if env.from_name else ''}<{env.from_address}>",
            f"*Date:* {env.received_at.astimezone(tz(user.timezone)).strftime('%a %d %b %Y, %H:%M')}"]
    if env.attachments:
        head.append("*Attachments:* " + ", ".join(a.name or a.mime_type for a in env.attachments[:8]))
    tail = []
    if clipped and message.web_url:
        tail.append(f"_The rest is in your mailbox:_ {message.web_url}")
    tail.append(f"_Reply_ */reply {message.ref}* · */remind {message.ref} tomorrow*")
    return ["\n".join(head) + "\n\n" + (body or "(no text)") + "\n\n" + "\n".join(tail)]


# ---------------------------------------------------------------- /remind


async def on_remind(db: AsyncSession, user: User, arg: str) -> list[str]:
    token, when_text_raw = _split(arg)
    message = await find_by_ref(db, user.id, token)
    if message is None:
        return [NO_CODE.format(verb="remind") if not token else f"I can't find an alert with code *{token}*."]
    zone = tz(user.timezone)
    now = datetime.now(UTC)
    when = parse_when(when_text_raw or DEFAULT_REMIND, now=now, zone=zone)
    if when is None:
        return [f"I didn't understand *{when_text_raw}*. Try: */remind {message.ref} 2h*, "
                f"*tomorrow 9am*, *mon 8:30*, *in 3 days* or *6pm*."]
    pending = await db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.kind == NotificationKind.reminder,
        Notification.status == NotificationStatus.queued, Notification.next_attempt_at > now)) or 0
    if pending >= MAX_PENDING_REMINDERS:
        return [f"You already have {pending} reminders waiting. Some need to fire before you add more."]
    destination = await outbox.default_destination(db, user.id)
    if destination is None:
        return ["You have no verified WhatsApp destination to remind."]
    payload = await message_payload(db, message, user)
    await outbox.enqueue(db, user_id=user.id, destination=destination, kind=NotificationKind.reminder,
                         payload=payload, dedupe=f"remind:{message.id}:{when.isoformat()}", message_id=message.id,
                         at=when)
    return [f"⏰ OK – I'll bring back *{message.subject[:80] or '(no subject)'}* {describe(when, now=now, zone=zone)}."]


# ---------------------------------------------------------------- /mute


async def _prefs(db: AsyncSession, user: User) -> UserSettings:
    prefs = await db.get(UserSettings, user.id)
    if prefs is None:
        prefs = UserSettings(user_id=user.id, quiet_hours={}, digest={})
        db.add(prefs)
        await db.flush()
    return prefs


def _mute_target(token: str) -> str | None:
    token = token.strip().lower().strip("<>").removeprefix("@")
    if "@" in token and "." in token.split("@", 1)[1]:
        return token
    if "." in token and " " not in token and len(token) <= 253:
        return token
    return None


async def on_mute(db: AsyncSession, user: User, arg: str) -> list[str]:
    token, rest = _split(arg)
    message = await find_by_ref(db, user.id, token) if token else None
    if message is not None:
        target = domain_of(message.from_address) if rest.lower().startswith("domain") else message.from_address
    else:
        target = _mute_target(token) if token else None
    if not target:
        return ["Mute what? */mute K7* (that sender), */mute K7 domain*, or */mute someone@example.com*."]
    prefs = await _prefs(db, user)
    muted = list(prefs.muted_senders or [])
    if target not in muted:
        if len(muted) >= MAX_MUTED:
            return [f"You've muted {MAX_MUTED} senders already. Remove some in the app first."]
        prefs.muted_senders = [*muted, target]
    return [f"🔕 Muted *{target}*. Their emails still appear in the app, but I won't message you about them.\n"
            f"Undo: */unmute {target}*"]


async def on_unmute(db: AsyncSession, user: User, arg: str) -> list[str]:
    target = (arg.strip().split(" ")[0] if arg.strip() else "").lower()
    prefs = await _prefs(db, user)
    muted = list(prefs.muted_senders or [])
    message = await find_by_ref(db, user.id, target) if target else None
    if message is not None:
        candidates = {message.from_address.lower(), domain_of(message.from_address)}
        target = next((m for m in muted if m in candidates), target)
    if target not in muted:
        return [f"*{target or '?'}* isn't muted. Send */muted* to see the list."]
    prefs.muted_senders = [m for m in muted if m != target]
    return [f"🔔 Unmuted *{target}*."]


async def on_muted(db: AsyncSession, user: User) -> list[str]:
    prefs = await db.get(UserSettings, user.id)
    muted = (prefs.muted_senders if prefs else None) or []
    if not muted:
        return ["You haven't muted anyone. Mute a sender from an alert with */mute K7*."]
    return ["🔕 *Muted senders*\n\n" + "\n".join(f"• {m}" for m in muted[:50]) + "\n\nUndo with */unmute <sender>*."]


# ---------------------------------------------------------------- /recent and /upcoming


async def on_recent(db: AsyncSession, user: User) -> list[str]:
    rows = (await db.scalars(select(Message).where(Message.user_id == user.id)
                             .order_by(Message.received_at.desc()).limit(8))).all()
    if not rows:
        return ["No important emails yet. They'll show up here as soon as a rule matches."]
    zone = tz(user.timezone)
    lines = ["📬 *Your latest important emails*", ""]
    for m in rows:
        stamp = m.received_at.astimezone(zone).strftime("%d %b %H:%M")
        lines.append(f"*#{m.ref or '–'}* {m.subject[:70] or '(no subject)'}")
        lines.append(f"    {m.from_name or m.from_address} · {stamp}")
    example = next((m.ref for m in rows if m.ref), "K7")
    lines += ["", f"_Act on one:_ */open {example}* · */reply {example}* · */remind {example} 2h*"]
    return ["\n".join(lines)]


async def on_upcoming(db: AsyncSession, user: User) -> list[str]:
    now = datetime.now(UTC)
    rows = (await db.scalars(select(Event).where(
        Event.user_id == user.id, Event.status.in_([EventStatus.upcoming, EventStatus.suggested]),
        Event.starts_at >= now - timedelta(hours=12), Event.starts_at <= now + timedelta(days=30),
    ).order_by(Event.starts_at).limit(12))).all()
    if not rows:
        return ["📅 Nothing coming up in the next 30 days. When an important email mentions an exam, interview or "
                "due date, I'll add it here and remind you."]
    lines = ["📅 *Coming up*", ""]
    for e in rows:
        icon = EVENT_ICONS.get(e.kind.value, "📅")
        flag = " _(unconfirmed)_" if e.status == EventStatus.suggested else ""
        when = when_text({"starts_at": e.starts_at.isoformat(), "all_day": e.all_day}, user.timezone)
        lines.append(f"{icon} *{when}* – {e.title[:90]}{flag}")
    lines += ["", f"Manage: {get_settings().public_web_url.rstrip('/')}/upcoming"]
    return ["\n".join(lines)]


# ---------------------------------------------------------------- /reply


async def on_reply(db: AsyncSession, user: User, arg: str) -> tuple[list[str], dict[str, Any] | None]:
    """Returns (messages, compose-session context). The caller sends the form and opens the session."""
    token, _ = _split(arg)
    message = await find_by_ref(db, user.id, token)
    if message is None:
        text = NO_CODE.format(verb="reply") if not token else f"I can't find an alert with code *{token}*."
        return [text], None
    headers = message.headers or {}
    reply_to = (headers.get("reply-to") or [None])[0]
    to = message.from_address
    if reply_to:
        parsed = [a for _, a in getaddresses([reply_to]) if a]
        to = parsed[0] if parsed else to
    subject = message.subject or ""
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}".strip()
    context = {"reply_to": str(message.id), "to": to, "subject": subject, "mailbox_id": str(message.mailbox_id)}
    return [], context


async def open_session(user_id: Any, extra: dict[str, Any]) -> None:
    await get_redis().set(Keys.compose_session(user_id),
                          json.dumps({"started_at": datetime.now(UTC).isoformat(), "template": None, **extra}),
                          ex=get_settings().compose_session_ttl_s)

