"""Turn RFC 5322 messages (or a list of header pairs) into Envelopes."""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import getaddresses, parsedate_to_datetime
from html import unescape
from uuid import UUID

from app.rules.envelope import Attachment, Envelope

_TAGS_DROP = re.compile(r"<(script|style|head)[^>]*>.*?</\1>", re.S | re.I)
_BREAKS = re.compile(r"<\s*(br|/p|/div|/tr|/li|/h\d|/table|/ul|/ol)\s*/?>", re.I)
_BLOCK_START = re.compile(r"<\s*(p|div|h\d|tr|table)\b[^>]*>", re.I)
_LIST_ITEM = re.compile(r"<\s*li\b[^>]*>", re.I)
_TAGS = re.compile(r"<[^>]+>")
_SPACES = re.compile(r"[ \t\r\f\v]+")
_BLANK_LINES = re.compile(r"\n\s*\n+")
_SPACE_BEFORE_PUNCT = re.compile(r"(?<=\S) +([.,;:!?])(?=\s|$)")
MAX_BODY_CHARS = 200_000


def html_to_text(html: str) -> str:
    text = _TAGS_DROP.sub(" ", html)
    text = _LIST_ITEM.sub("\n• ", text)
    text = _BLOCK_START.sub("\n", text)
    text = _BREAKS.sub("\n", text)
    text = unescape(_TAGS.sub(" ", text))
    text = _SPACES.sub(" ", text)
    text = _SPACE_BEFORE_PUNCT.sub(r"\1", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    return _BLANK_LINES.sub("\n\n", text).strip()


def make_snippet(text: str, limit: int) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[: limit - 1].rstrip() + "…"


def _addresses(values: Iterable[str]) -> list[tuple[str, str]]:
    return [(name, addr.lower()) for name, addr in getaddresses(list(values)) if addr]


def _received_at(date_header: str | None, fallback: datetime | None) -> datetime:
    if fallback:
        return fallback
    if date_header:
        try:
            parsed = parsedate_to_datetime(date_header)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        except (TypeError, ValueError):
            pass
    return datetime.now(UTC)


def envelope_from_headers(
    pairs: Iterable[tuple[str, str]], *, mailbox_id: UUID, message_id: str,
    received_at: datetime | None = None, snippet: str = "", thread_id: str | None = None,
    web_url: str | None = None,
) -> Envelope:
    headers: dict[str, list[str]] = {}
    for name, value in pairs:
        headers.setdefault(name.lower(), []).append(str(value))
    sender = _addresses(headers.get("from", []))
    from_name, from_address = sender[0] if sender else ("", "")
    return Envelope(
        mailbox_id=mailbox_id,
        provider_message_id=message_id,
        received_at=_received_at((headers.get("date") or [None])[0], received_at),
        from_address=from_address,
        from_name=from_name,
        to=[a for _, a in _addresses(headers.get("to", []))],
        cc=[a for _, a in _addresses(headers.get("cc", []))],
        reply_to=[a for _, a in _addresses(headers.get("reply-to", []))],
        subject=(headers.get("subject") or [""])[0],
        snippet=snippet,
        headers=headers,
        thread_id=thread_id,
        web_url=web_url,
    )


def _part_text(part: EmailMessage | None) -> str:
    if part is None:
        return ""
    try:
        content = part.get_content()
    except (LookupError, ValueError, AssertionError):
        payload = part.get_payload(decode=True) or b""
        content = payload.decode("utf-8", errors="replace") if isinstance(payload, bytes) else ""
    if not isinstance(content, str):
        return ""
    return html_to_text(content) if part.get_content_type() == "text/html" else content


def _body_text(msg: EmailMessage) -> str:
    """The plain-text part, unless it's a stub ("view this email in your browser") and the HTML says more."""
    plain = _part_text(msg.get_body(preferencelist=("plain",)))  # type: ignore[arg-type]
    html = _part_text(msg.get_body(preferencelist=("html",)))  # type: ignore[arg-type]
    if not plain or (len(html) > 2 * len(plain) and (len(plain) < 200 or len(html) > 3 * len(plain))):
        return (html or plain)[:MAX_BODY_CHARS]
    return plain[:MAX_BODY_CHARS]


MAX_CALENDAR_BYTES = 256 * 1024


def _calendars(msg: EmailMessage) -> list[bytes]:
    """text/calendar parts, inline (Gmail/Outlook invites) or attached as .ics."""
    found: list[bytes] = []
    for part in msg.walk():
        name = (part.get_filename() or "").lower()
        if part.get_content_type() != "text/calendar" and not name.endswith(".ics"):
            continue
        payload = part.get_payload(decode=True)
        if isinstance(payload, bytes) and 0 < len(payload) <= MAX_CALENDAR_BYTES:
            found.append(payload)
    return found[:5]


@dataclass(frozen=True, slots=True)
class AttachmentPart:
    name: str
    mime_type: str
    data: bytes


def attachment_parts(raw: bytes) -> list[AttachmentPart]:
    """Attachments with their bytes, in the same order as Envelope.attachments."""
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    assert isinstance(msg, EmailMessage)
    out = []
    for part in msg.iter_attachments():
        payload = part.get_payload(decode=True)
        out.append(AttachmentPart(part.get_filename() or "", part.get_content_type(),
                                  payload if isinstance(payload, bytes) else b""))
    return out


def _attachments(msg: EmailMessage) -> list[Attachment]:
    found: list[Attachment] = []
    for part in msg.iter_attachments():
        payload = part.get_payload(decode=True)
        found.append(Attachment(
            name=part.get_filename() or "",
            mime_type=part.get_content_type(),
            size=len(payload) if isinstance(payload, bytes) else 0,
        ))
    return found


def envelope_from_bytes(
    raw: bytes, *, mailbox_id: UUID, message_id: str, full: bool, snippet_chars: int,
    received_at: datetime | None = None, snippet: str = "", thread_id: str | None = None,
    web_url: str | None = None,
) -> Envelope:
    parser = BytesParser(policy=policy.default)
    msg = parser.parsebytes(raw, headersonly=not full)
    assert isinstance(msg, EmailMessage)
    env = envelope_from_headers(
        [(k, str(v)) for k, v in msg.items()], mailbox_id=mailbox_id, message_id=message_id,
        received_at=received_at, snippet=snippet, thread_id=thread_id, web_url=web_url,
    )
    if full:
        env.body_text = _body_text(msg)
        env.attachments = _attachments(msg)
        env.calendars = _calendars(msg)
        if not env.snippet:
            env.snippet = make_snippet(env.body_text, snippet_chars)
    return env


_NOISE = re.compile(
    r"(unsubscribe|view (this|it) in (your|a) browser|manage (your )?preferences|this (e-?mail|message) was sent"
    r"|you (are )?receiv(ed|ing) this|privacy policy|all rights reserved|^\s*©|do not reply to this)",
    re.I,
)
_GREETING = re.compile(r"^(dear|hi|hello|hey|greetings|good (morning|afternoon|evening))\b.{0,60}$", re.I)
_SIGNOFF = re.compile(r"^(--\s*|(best |kind |warm )?regards|thanks( and regards)?|thank you|sincerely|cheers)"
                      r"[,.!]?\s*$", re.I)
_URL_ONLY = re.compile(r"^\s*(<?https?://\S+>?|\[[^\]]*\]\(https?://\S+\))\s*$")


def readable_preview(body: str, limit: int = 600) -> str:
    """The part of an email a person would actually read: no greeting, quoted history, footer or signature."""
    from app.events.extract import strip_quoted  # local import: events imports providers indirectly

    lines: list[str] = []
    for raw in strip_quoted(body or "").replace("\r", "").split("\n"):
        line = " ".join(raw.split())
        if not line:
            if lines and lines[-1]:
                lines.append("")
            continue
        if _SIGNOFF.match(line) and lines:
            break
        if _URL_ONLY.match(line) or _NOISE.search(line):
            continue
        if not any(lines) and _GREETING.match(line):
            continue
        lines.append(line)
    text = "\n".join(lines).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    cut = cut[: cut.rfind(" ")] if " " in cut[limit // 2:] else cut
    return cut.rstrip(" ,;:-") + "…"
