"""WhatsApp message rendering. WhatsApp formatting: *bold*, _italic_, > quote."""

from typing import Any

from app.core.config import get_settings

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


def render_alert(p: dict[str, Any]) -> str:
    rules = ", ".join(p.get("rules", [])) or "—"
    lines = [
        "📬 *Important email*",
        f"*Rule:* {_plain(rules)}",
        f"*Inbox:* {p.get('mailbox_address', '')}",
        f"*From:* {_sender(p)}",
        f"*Subject:* {_plain(_clip(p.get('subject'), MAX_SUBJECT)) or '(no subject)'}",
    ]
    snippet = _clip(p.get("snippet"), get_settings().snippet_chars)
    if snippet:
        lines += ["", f"> {_plain(snippet)}"]
    if p.get("web_url"):
        lines += ["", f"Open in mail: {p['web_url']}"]
    if link := message_link(p):
        lines += [f"Details: {link}"]
    return "\n".join(lines)


def render_batch(items: list[dict[str, Any]], title: str) -> str:
    lines = [f"📬 *{title}*", ""]
    for i, p in enumerate(items[:MAX_LINES_IN_BATCH], 1):
        subject = _plain(_clip(p.get("subject"), 80)) or "(no subject)"
        rules = _plain(", ".join(p.get("rules", [])))
        lines.append(f"{i}. *{subject}*")
        lines.append(f"    {_sender(p)} · _{rules}_")
    if len(items) > MAX_LINES_IN_BATCH:
        lines += ["", f"…and {len(items) - MAX_LINES_IN_BATCH} more."]
    lines += ["", f"See all: {get_settings().public_web_url.rstrip('/')}/messages"]
    return "\n".join(lines)


def render_payload(kind: str, payload: dict[str, Any]) -> str:
    if kind == "alert":
        return render_alert(payload)
    if kind == "digest":
        items = payload.get("items", [])
        return render_batch(items, payload.get("title") or f"{len(items)} important emails")
    return str(payload.get("text", ""))


def render_many(alerts: list[dict[str, Any]]) -> str:
    if len(alerts) == 1:
        return render_alert(alerts[0])
    return render_batch(alerts, f"{len(alerts)} important emails")
