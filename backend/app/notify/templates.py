"""WhatsApp message rendering for alerts, batches and reminders (layout helpers live in notify.wa)."""

from datetime import datetime
from typing import Any

from app.core.config import get_settings
from app.notify import wa
from app.services.schedule import tz

MAX_SUBJECT = 120
MAX_LINES_IN_BATCH = 10


def _clip(text: str | None, limit: int) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


_plain = wa.plain


def message_link(p: dict[str, Any]) -> str | None:
    mid = p.get("message_id")
    return f"{get_settings().public_web_url.rstrip('/')}/messages/{mid}" if mid else None


EVENT_ICONS = {"exam": "🎓", "interview": "🤝", "deadline": "⏳", "payment": "💳", "meeting": "📅",
               "travel": "✈️", "other": "📅"}


def when_text(event: dict[str, Any], timezone: str | None) -> str:
    start = datetime.fromisoformat(event["starts_at"]).astimezone(tz(timezone))
    return start.strftime("%a %d %b") if event.get("all_day") else start.strftime("%a %d %b, %H:%M")


def _sender_line(p: dict[str, Any]) -> str:
    name, address = (p.get("from_name") or "").strip(), p.get("from_address") or ""
    return f"*{_plain(name)}* · {address}" if name and name.lower() != address.lower() else address


def _heading(p: dict[str, Any]) -> list[str]:
    """Title and 'who' lines; replies and forwards say so instead of hiding it."""
    thread = p.get("thread") or {}
    kind = thread.get("kind", "new")
    subject = _plain(_clip(wa.strip_prefixes(p.get("subject") or ""), MAX_SUBJECT)) or "(no subject)"
    name = _plain((p.get("from_name") or "").strip() or p.get("from_address") or "Someone")
    if kind == "reply":
        earlier = int(thread.get("earlier") or 0)
        lines = [f"↩️ *{subject}*", f"*{name}* replied · {p.get('from_address') or ''}"]
        if earlier:
            lines.append(f"🧵 _{earlier} earlier message{'s' if earlier != 1 else ''} in this thread_")
        return lines
    if kind == "forward":
        original = _plain(thread.get("forwarded_from") or "")
        lines = [f"↪️ *{subject}*", f"*{name}* forwarded an email" + (f" from *{original}*" if original else "")]
        if note := _clip(thread.get("note"), 200):
            lines.append(f"💬 _{_plain(note)}_")
        return lines
    return [f"📬 *{subject}*", _sender_line(p)]


def _actions(ref: str) -> str:
    return f"👉 */open {ref}* · */reply {ref}* · */remind {ref} 2h*"


def render_alert(p: dict[str, Any]) -> str:
    """Who and what first, then the gist (AI summary or the readable part of the email), files, dates, actions.

    📬 *Subject*
    *Sender* · address

    📝 *In short:* …
    ✅ *To do:* …

    > the email's own words (a few lines)

    📎 2 files: a.pdf, b.docx
    📅 *Thu 15 Oct, 10:00* · I'll remind you

    🏷️ Rule · to mailbox · *#K7*
    👉 /open K7 full email · /reply K7 · /remind K7 2h
    """
    ref = p.get("ref")
    lines = ["🚨 *Urgent*"] if p.get("urgent") else []
    lines += _heading(p)
    ai = p.get("ai") or {}
    if ai.get("summary"):
        lines += ["", f"📝 *In short:* {_plain(ai['summary'])}"]
        if ai.get("action"):
            lines.append(f"✅ *To do:* {_plain(ai['action'])}")
    limit = get_settings().alert_preview_chars
    excerpt = wa.quote(p.get("snippet"), max_chars=300 if ai.get("summary") else limit,
                       max_lines=4 if ai.get("summary") else 8)
    if excerpt:
        lines += ["", excerpt]
    extras = []
    if files := wa.files_line(p.get("attachments") or []):
        extras.append(files)
    for e in (p.get("events") or [])[:3]:
        icon = EVENT_ICONS.get(e.get("kind", "other"), "📅")
        note = "I'll remind you" if e.get("reminders") else "confirm it in the app"
        extras.append(f"{icon} *{when_text(e, p.get('timezone'))}* · {note}")
    if extras:
        lines += ["", *extras]
    meta = [f"🏷️ {_plain(', '.join(p.get('rules') or []))}"] if p.get("rules") else []
    if p.get("mailbox_address"):
        meta.append(f"to {p['mailbox_address']}")
    if ref:
        meta.append(f"*#{ref}*")
    lines += ["", " · ".join(meta)] if meta else []
    if ref:
        lines.append(_actions(ref))
    elif link := message_link(p):
        lines.append(f"Details: {link}")
    return "\n".join(lines)


def render_batch(items: list[dict[str, Any]], title: str) -> str:
    lines = [f"📬 *{title}*"]
    for p in items[:MAX_LINES_IN_BATCH]:
        subject = _plain(_clip(wa.strip_prefixes(p.get("subject") or ""), 80)) or "(no subject)"
        icon = {"reply": "↩️", "forward": "↪️"}.get((p.get("thread") or {}).get("kind", ""), "•")
        ref = f"  *#{p['ref']}*" if p.get("ref") else ""
        who = _plain(_clip((p.get("from_name") or "").strip() or p.get("from_address"), 40))
        summary = (p.get("ai") or {}).get("summary") or ""
        about = f" · _{_plain(_clip(summary, 90))}_" if summary else ""
        lines += ["", f"{icon} *{subject}*{ref}", f"     {who}{about}"]
    if len(items) > MAX_LINES_IN_BATCH:
        lines += ["", f"…and {len(items) - MAX_LINES_IN_BATCH} more."]
    first = next((p["ref"] for p in items if p.get("ref")), None)
    lines += ["", f"👉 */open {first}* to read one · all: {get_settings().public_web_url.rstrip('/')}/messages"
              if first else f"See all: {get_settings().public_web_url.rstrip('/')}/messages"]
    return "\n".join(lines)


def render_reminder(p: dict[str, Any]) -> str:
    event = p.get("event")
    if event:
        icon = EVENT_ICONS.get(event.get("kind", "other"), "📅")
        lines = [f"⏰ *{_plain(p.get('lead') or 'Coming up')}*", "",
                 f"{icon} *{_plain(_clip(event.get('title'), 160))}*",
                 f"🗓️ {when_text(event, p.get('timezone'))}"]
        if event.get("location"):
            lines.append(f"📍 {_plain(event['location'])}")
        if ref := p.get("ref"):
            lines += ["", f"👉 */open {ref}* to read the email"]
        return "\n".join(lines)
    head = ["⏰ *Reminder* · you asked me to bring this back"]
    if p.get("note"):
        head.append(f"📝 {_plain(p['note'])}")
    return "\n".join(head) + "\n\n" + render_alert({**p, "events": []})


def render_payload(kind: str, payload: dict[str, Any]) -> str:
    if kind == "alert":
        return render_alert(payload)
    if kind == "reminder":
        return render_reminder(payload)
    if kind == "digest":
        items = payload.get("items", [])
        return render_batch(items, payload.get("title") or f"{len(items)} important emails")
    return str(payload.get("text", ""))


def render_many(alerts: list[dict[str, Any]]) -> str:
    if len(alerts) == 1:
        return render_alert(alerts[0])
    return render_batch(alerts, f"{len(alerts)} important emails")
