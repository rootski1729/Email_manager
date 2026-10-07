"""Act on alerts from WhatsApp: /open, /reply, /remind, /mute, /recent, /upcoming.

Every alert carries a short per-user code (#K7). Commands take that code, or the user quotes the alert in
WhatsApp and types just the action ("remind 2h"), which the parser rewrites into the full command.
"""

import base64
import json
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import getaddresses
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.compose import commands as cmd
from app.compose.when import describe, parse_when
from app.core.config import get_settings
from app.core.redis import Keys, get_redis
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
from app.notify import wa
from app.notify.templates import EVENT_ICONS, when_text
from app.rules.envelope import domain_of
from app.services import mail_content, outbox
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


# ---------------------------------------------------------------- /open, /thread, /files

MAX_OPEN_PARTS = 4  # WhatsApp messages for one email body; the rest is on the website
MAX_FILE_BYTES = 15 * 1024 * 1024
MAX_FILES_BYTES = 30 * 1024 * 1024
FILE_TTL_S = 15 * 60


def _when(env_received: datetime, user: User) -> str:
    return env_received.astimezone(tz(user.timezone)).strftime("%a %d %b %Y, %H:%M")


def _addresses_line(label: str, values: list[str], limit: int = 4) -> str | None:
    if not values:
        return None
    more = f" +{len(values) - limit} more" if len(values) > limit else ""
    return f"*{label}:* {', '.join(values[:limit])}{more}"


def _web_link(message: Message) -> str:
    return f"{get_settings().public_web_url.rstrip('/')}/messages/{message.id}"


async def _load(db: AsyncSession, user: User, token: str, verb: str) -> tuple[Message | None, Any, str | None]:
    """(message, full email, error text)."""
    message = await find_by_ref(db, user.id, token)
    if message is None:
        return None, None, NO_CODE.format(verb=verb) if not token else f"I can't find an alert with code *{token}*."
    try:
        return message, await mail_content.fetch_full(db, message), None
    except mail_content.ContentError as exc:
        return message, None, f"⚠️ {exc}"


async def on_open(db: AsyncSession, user: User, arg: str) -> list[str]:
    """The whole email: a header, the text (split over a few messages if long), then files and thread."""
    token, _ = _split(arg)
    message, full, error = await _load(db, user, token, "open")
    if error or message is None or full is None:
        return [error or "?"]
    env, reading = full.env, full.reading
    ref = message.ref
    head = [f"📖 *{wa.plain(wa.clip(env.subject, 200)) or '(no subject)'}*",
            f"*From:* {wa.plain(env.from_name) + ' · ' if env.from_name else ''}{env.from_address}"]
    head += [line for line in (_addresses_line("To", env.to), _addresses_line("Cc", env.cc)) if line]
    head.append(f"*Date:* {_when(env.received_at, user)}")
    if reading.kind == "reply" and reading.earlier:
        head.append(f"🧵 Reply in a thread · {reading.earlier} earlier message{'s' if reading.earlier != 1 else ''}")
    if reading.kind == "forward":
        note = reading.latest.strip()
        original = wa.plain(reading.forwarded_from) or "someone"
        body = (f"💬 {wa.plain(note)}\n\n" if note else "") + f"↪️ *Forwarded email from {original}*"
        if reading.forwarded_subject:
            body += f"\n_{wa.plain(reading.forwarded_subject)}_"
        body += "\n\n" + wa.plain(reading.forwarded_body)
    else:
        body = wa.plain(reading.latest or env.snippet or "")
    body = re.sub(r"\n\s*\n\s*\n+", "\n\n", body).strip() or "_(This email has no text.)_"
    parts = wa.chunks(body, MAX_OPEN_CHARS)
    clipped = len(parts) > MAX_OPEN_PARTS
    parts = parts[:MAX_OPEN_PARTS]
    if len(parts) > 1:
        parts = [f"{p}\n\n_({i}/{len(parts)}{'+' if clipped and i == len(parts) else ''})_"
                 for i, p in enumerate(parts, 1)]
    messages = ["\n".join(head) + f"\n{wa.RULE}\n\n" + parts[0], *parts[1:]]

    tail: list[str] = []
    if clipped:
        tail += [f"📄 The email is longer than this. Read it all on the website:\n{_web_link(message)}", ""]
    files = wa.meaningful_files([{"name": a.name, "type": a.mime_type, "size": a.size} for a in env.attachments])
    if files:
        tail.append(f"📎 *Attachments ({len(files)})*")
        tail += [f"{i}. {wa.plain(wa.clip(f['name'], 60))} · {wa.human_size(f['size'])}" for i, f in
                 enumerate(files[:10], 1)]
        tail += [f"👉 */files {ref}* sends them here" + (f" · one file: */files {ref} 1*" if len(files) > 1 else ""),
                 ""]
    if reading.history:
        count = reading.earlier or 1
        tail += [f"🧵 *Earlier in this thread:* {count} message{'s' if count != 1 else ''}",
                 f"👉 */thread {ref}* to read them", ""]
    tail.append(f"↩️ */reply {ref}* · ⏰ */remind {ref} 2h* · 🔕 */mute {ref}*")
    footer = "\n".join(tail)
    if len(messages[-1]) + len(footer) + 2 <= MAX_OPEN_CHARS:
        messages[-1] += f"\n\n{wa.RULE}\n" + footer
    else:
        messages.append(footer)
    return messages


async def on_thread(db: AsyncSession, user: User, arg: str) -> list[str]:
    """The earlier messages of a reply, newest first, each with who wrote it and when."""
    token, _ = _split(arg)
    message, full, error = await _load(db, user, token, "thread")
    if error or message is None or full is None:
        return [error or "?"]
    earlier = full.thread
    if not earlier:
        return [f"🧵 *#{message.ref}* isn't part of a longer thread, so there's nothing earlier to show.\n"
                f"👉 */open {message.ref}* reads this email."]
    blocks = []
    for i, m in enumerate(earlier, 1):
        who = wa.plain(m.sender) or "Earlier message"
        when = f" · _{wa.plain(m.sent)}_" if m.sent else ""
        blocks.append(f"*{i}. {who}*{when}\n{wa.plain(m.text)}")
    subject = wa.plain(wa.clip(wa.strip_prefixes(full.env.subject), 120)) or "(no subject)"
    text = (f"🧵 *Earlier in this thread* ({len(earlier)})\n_{subject}_\n{wa.RULE}\n\n"
            + f"\n\n{wa.RULE}\n\n".join(blocks))
    parts = wa.chunks(text, MAX_OPEN_CHARS)
    clipped = len(parts) > MAX_OPEN_PARTS
    parts = parts[:MAX_OPEN_PARTS]
    if clipped:
        parts[-1] += f"\n\n📄 There's more. Read the whole thread on the website:\n{_web_link(message)}"
    parts[-1] += f"\n\n👉 */open {message.ref}* for the newest message · */reply {message.ref}* to answer"
    return parts


@dataclass
class FileToSend:
    caption: str
    filename: str
    mimetype: str
    token: str


async def on_files(db: AsyncSession, user: User, arg: str) -> tuple[list[str], list[FileToSend]]:
    """Stage an email's attachments for the dispatcher to send as WhatsApp documents."""
    token, rest = _split(arg)
    message, full, error = await _load(db, user, token, "files")
    if error or message is None or full is None:
        return [error or "?"], []
    parts = [p for p in full.files() if p.name and p.data]
    shown = wa.meaningful_files([{"name": p.name, "type": p.mime_type, "size": len(p.data), "part": p}
                                 for p in parts])
    if not shown:
        return [f"📎 *#{message.ref}* has no attachments."], []
    picked = shown
    if rest:
        numbers = [int(n) for n in re.findall(r"\d+", rest)]
        picked = [shown[n - 1] for n in numbers if 1 <= n <= len(shown)]
        if not picked:
            return [f"There are {len(shown)} files. Pick one by number, e.g. */files {message.ref} 1*."], []
    staged: list[FileToSend] = []
    skipped: list[str] = []
    total = 0
    redis = get_redis()
    for f in picked:
        part = f["part"]
        if len(part.data) > MAX_FILE_BYTES or total + len(part.data) > MAX_FILES_BYTES:
            skipped.append(f"{wa.plain(part.name)} ({wa.human_size(len(part.data))})")
            continue
        total += len(part.data)
        key = secrets.token_urlsafe(16)
        await redis.set(Keys.wa_file(key), base64.b64encode(part.data).decode(), ex=FILE_TTL_S)
        staged.append(FileToSend(caption=f"📎 {wa.plain(part.name)} · from *#{message.ref}*", filename=part.name,
                                 mimetype=part.mime_type, token=key))
    texts = []
    if staged:
        label = "1 file" if len(staged) == 1 else f"{len(staged)} files"
        texts.append(f"📎 Sending {label} from *{wa.plain(wa.clip(full.env.subject, 80)) or '#' + str(message.ref)}*…")
    if skipped:
        texts.append("⚠️ Too big for WhatsApp, open these on the website instead:\n"
                     + "\n".join(f"- {s}" for s in skipped) + f"\n{_web_link(message)}")
    return texts, staged


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
        ref = message.ref
        return [f"🤔 I didn't understand *{wa.plain(when_text_raw)}*. Try one of these:\n"
                f"- */remind {ref} 2h*\n- */remind {ref} 6pm*\n- */remind {ref} tomorrow 9am*\n"
                f"- */remind {ref} mon 8:30*\n- */remind {ref} in 3 days*"]
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
    when_said = describe(when, now=now, zone=zone)
    return [f"⏰ *Reminder set*\n\n*{wa.plain(wa.clip(message.subject, 90)) or '(no subject)'}*  #{message.ref}\n"
            f"🗓️ {when_said[:1].upper() + when_said[1:]}\n\n"
            f"_Change it:_ */remind {message.ref} 6pm* · */remind {message.ref} tomorrow*"]


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
    return [f"🔕 *Muted* {target}\n\nTheir emails still show up in the app, but I won't message you about them."
            f"\n\n_Undo:_ */unmute {target}*"]


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
    return ["🔕 *Muted senders*\n\n" + "\n".join(f"- {m}" for m in muted[:50])
            + f"\n\n_Undo:_ */unmute {muted[0]}*"]


# ---------------------------------------------------------------- /recent and /upcoming


async def on_recent(db: AsyncSession, user: User) -> list[str]:
    rows = (await db.scalars(select(Message).where(Message.user_id == user.id)
                             .order_by(Message.received_at.desc()).limit(8))).all()
    if not rows:
        return ["No important emails yet. They'll show up here as soon as a rule matches."]
    zone = tz(user.timezone)
    lines = ["📬 *Your latest important emails*"]
    for m in rows:
        stamp = m.received_at.astimezone(zone).strftime("%d %b, %H:%M")
        subject = wa.plain(wa.clip(m.subject, 70)) or "(no subject)"
        who = wa.plain(wa.clip(m.from_name or m.from_address, 40))
        lines += ["", f"*#{m.ref or '–'}* {subject}", f"_{who} · {stamp}_"]
    example = next((m.ref for m in rows if m.ref), "K7")
    lines += ["", f"👉 */open {example}* · */reply {example}* · */remind {example} 2h*"]
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
    lines = ["📅 *Coming up*"]
    for e in rows:
        icon = EVENT_ICONS.get(e.kind.value, "📅")
        flag = " · _not confirmed yet_" if e.status == EventStatus.suggested else ""
        when = when_text({"starts_at": e.starts_at.isoformat(), "all_day": e.all_day}, user.timezone)
        lines += ["", f"{icon} *{when}*{flag}", wa.plain(wa.clip(e.title, 90))]
    lines += ["", f"_Manage dates:_ {get_settings().public_web_url.rstrip('/')}/upcoming"]
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

