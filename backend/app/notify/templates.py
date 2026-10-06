"""WhatsApp message rendering. WhatsApp formatting: *bold*, _italic_, > quote."""

from datetime import datetime
from typing import Any

from app.core.config import get_settings
from app.services.schedule import tz

MAX_SUBJECT = 120
MAX_LINES_IN_BATCH = 10


def _clip(text: str | None, limit: int) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _plain(text: str) -> str:
    """Neutralise WhatsApp formatting characters inside user content."""
    return text.replace("*", "∗").replace("_", "ˍ").replace("~", "˜").replace("`", "'")


def _sender(p: dict[str, Any]) -> str:
    name, address = p.get("from_name") or "", p.get("from_address") or ""
    return f"{_plain(name)} <{address}>" if name and name.lower() != address else address


def message_link(p: dict[str, Any]) -> str | None:
    mid = p.get("message_id")
    return f"{get_settings().public_web_url.rstrip('/')}/messages/{mid}" if mid else None


EVENT_ICONS = {"exam": "📝", "interview": "🤝", "deadline": "⏳", "payment": "💳", "meeting": "📅",
               "travel": "✈️", "other": "📅"}


def when_text(event: dict[str, Any], timezone: str | None) -> str:
    start = datetime.fromisoformat(event["starts_at"]).astimezone(tz(timezone))
    return start.strftime("%a %d %b") if event.get("all_day") else start.strftime("%a %d %b, %H:%M")


def render_alert(p: dict[str, Any]) -> str:
    rules = ", ".join(p.get("rules", [])) or "—"
    ref = p.get("ref")
    head = "🚨 *Urgent email*" if p.get("urgent") else "📬 *Important email*"
    lines = [
        f"{head}  #{ref}" if ref else head,
        f"*Rule:* {_plain(rules)}",
        f"*Inbox:* {p.get('mailbox_address', '')}",
        f"*From:* {_sender(p)}",
        f"*Subject:* {_plain(_clip(p.get('subject'), MAX_SUBJECT)) or '(no subject)'}",
    ]
    snippet = _clip(p.get("snippet"), get_settings().snippet_chars)
    if snippet:
        lines += ["", f"> {_plain(snippet)}"]
    events = p.get("events") or []
    if events:
        lines.append("")
        for e in events[:3]:
            icon = EVENT_ICONS.get(e.get("kind", "other"), "📅")
            note = " – I'll remind you" if e.get("reminders") else " – confirm in the app"
            lines.append(f"{icon} *{when_text(e, p.get('timezone'))}*{note}")
    if p.get("web_url"):
        lines += ["", f"Open in mail: {p['web_url']}"]
    if link := message_link(p):
        lines += [f"Details: {link}"]
    if ref:
        lines += ["", f"_Reply_ */open {ref}* · */reply {ref}* · */remind {ref} 2h* · */mute {ref}*"]
    return "\n".join(lines)


def render_batch(items: list[dict[str, Any]], title: str) -> str:
    lines = [f"📬 *{title}*", ""]
    for i, p in enumerate(items[:MAX_LINES_IN_BATCH], 1):
        subject = _plain(_clip(p.get("subject"), 80)) or "(no subject)"
        rules = _plain(", ".join(p.get("rules", [])))
        ref = f"  #{p['ref']}" if p.get("ref") else ""
        lines.append(f"{i}. *{subject}*{ref}")
        lines.append(f"    {_sender(p)} · _{rules}_")
    if len(items) > MAX_LINES_IN_BATCH:
        lines += ["", f"…and {len(items) - MAX_LINES_IN_BATCH} more."]
    lines += ["", f"See all: {get_settings().public_web_url.rstrip('/')}/messages"]
    if any(p.get("ref") for p in items):
        lines.append("_Use a code to act on one, e.g._ */open " + next(p["ref"] for p in items if p.get("ref")) + "*")
    return "\n".join(lines)


def render_reminder(p: dict[str, Any]) -> str:
    event = p.get("event")
    if event:
        icon = EVENT_ICONS.get(event.get("kind", "other"), "📅")
        lead = p.get("lead") or "Coming up"
        lines = [f"⏰ *{lead}*", f"{icon} *{_plain(_clip(event.get('title'), 160))}*",
                 f"🗓️ {when_text(event, p.get('timezone'))}"]
        if event.get("location"):
            lines.append(f"📍 {_plain(event['location'])}")
        if ref := p.get("ref"):
            lines += ["", f"_Reply_ */open {ref}* _to read the email_"]
        return "\n".join(lines)
    alert = render_alert({**p, "events": []})
    note = f"\n📝 {_plain(p['note'])}" if p.get("note") else ""
    return "⏰ *Reminder* – you asked me to bring this back" + note + "\n\n" + alert


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
