"""Read an email the way a person would: what's new in it, what's quoted history, and what was forwarded.

Replies carry the whole conversation below the new text ("On Tue … wrote:", Outlook's "From: … Sent: …"
block, "> " quotes). Forwards wrap someone else's email under a "Forwarded message" header. Alerts and
WhatsApp messages show the new part first and say what was left out, instead of dumping the thread.
"""

import re
from dataclasses import dataclass
from typing import Literal

# Where quoted history starts in a reply. Gmail may wrap "On … wrote:" over two lines.
_REPLY_MARKERS = [
    re.compile(r"^[ \t]*On\s[^\n]{4,200}(?:\n[^\n]{0,160})?\swrote:[ \t]*$", re.M | re.I),
    re.compile(r"^[ \t]*-{2,}\s*Original Message\s*-{2,}[ \t]*$", re.M | re.I),
    re.compile(r"^[ \t]*_{8,}[ \t]*\n(?=[ \t]*\*?From:)", re.M),
    re.compile(r"^[ \t]*\*?From:\*?\s[^\n]+\n[ \t]*\*?(?:Sent|Date):\*?\s", re.M | re.I),
    re.compile(r"^[ \t]*(?:Le|El|Il)\s[^\n]{4,200}\s(?:a écrit|escribió|ha scritto)\s?:[ \t]*$", re.M | re.I),
    re.compile(r"^[ \t]*Am\s[^\n]{4,200}\sschrieb[^\n]{0,80}:[ \t]*$", re.M | re.I),
]
_FORWARD_MARKER = re.compile(
    r"^[ \t>]*(?:-{3,}\s*Forwarded message\s*-{3,}|Begin forwarded message:|-{3,}\s*Weitergeleitete Nachricht\s*-{3,})"
    r"[ \t]*$", re.M | re.I)
_FORWARD_HEADER = re.compile(r"^\s*\*?(from|date|sent|subject|to|cc)\*?:\s*(.*)$", re.I)
_QUOTE_PREFIX = re.compile(r"^[ \t]*(?:>[ \t]?)+", re.M)
_TRAILING_QUOTES = re.compile(r"(?:\n[ \t]*>[^\n]*)+\s*$")
_NAME_ADDR = re.compile(r"^\s*\"?([^\"<]*?)\"?\s*<([^>]+)>\s*$")


@dataclass(frozen=True, slots=True)
class Reading:
    kind: Literal["new", "reply", "forward"]
    latest: str  # what the sender wrote in this email (for a forward: their note, often empty)
    history: str  # earlier messages in the thread, unquoted; empty for a new email
    earlier: int  # roughly how many earlier messages the history holds
    forwarded_from: str = ""  # forwards: who wrote the original ("UPPCL Billing")
    forwarded_subject: str = ""
    forwarded_body: str = ""  # forwards: the original email's own new text

    @property
    def main_text(self) -> str:
        """The text worth showing first: the new reply, or the forwarded email (after any note)."""
        return self.forwarded_body if self.kind == "forward" else self.latest


def _first_reply_marker(text: str) -> re.Match[str] | None:
    found = [m for p in _REPLY_MARKERS if (m := p.search(text))]
    return min(found, key=lambda m: m.start()) if found else None


def _count_markers(text: str) -> int:
    """Earlier messages in a history. Back-to-back markers (Outlook's line, then "From:/Sent:") are one message."""
    spans = sorted((m.start(), m.end()) for p in _REPLY_MARKERS for m in p.finditer(text))
    count, last_end = 0, None
    for start, end in spans:
        if last_end is None or text[last_end:start].strip():
            count += 1
        last_end = max(end, last_end or end)
    return count


def _unquote(text: str) -> str:
    return _QUOTE_PREFIX.sub("", text).strip()


def display_name(value: str) -> str:
    """'UPPCL Billing <noreply@uppcl.org>' -> 'UPPCL Billing'; a bare address stays as it is."""
    match = _NAME_ADDR.match(value)
    if match:
        return match.group(1).strip() or match.group(2).strip()
    return value.strip().strip("<>")


def _split_reply(text: str) -> tuple[str, str]:
    """(new text, quoted history)."""
    marker = _first_reply_marker(text)
    if marker:
        return text[: marker.start()].rstrip(), _unquote(text[marker.start():])
    tail = _TRAILING_QUOTES.search(text)  # a reply that only has "> " lines at the bottom
    if tail and tail.start() > 0:
        return text[: tail.start()].rstrip(), _unquote(text[tail.start():])
    return text.strip(), ""


def read_email(body: str | None, *, subject: str = "", in_reply_to: bool = False) -> Reading:
    text = (body or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    forward = _FORWARD_MARKER.search(text)
    reply = _first_reply_marker(text)
    is_fwd_subject = bool(re.match(r"^\s*(fwd?|fw)\s*:", subject, re.I))
    if forward and (reply is None or forward.start() <= reply.start()):
        note = _unquote(text[: forward.start()])
        rest = text[forward.end():].lstrip("\n").split("\n")
        headers: dict[str, str] = {}
        i = 0
        while i < len(rest) and (match := _FORWARD_HEADER.match(_unquote(rest[i]))):
            headers.setdefault(match.group(1).lower(), match.group(2).strip())
            i += 1
        original = _unquote("\n".join(rest[i:]))
        new, history = _split_reply(original)
        return Reading("forward", note, history, _count_markers(history) + (1 if history else 0),
                       forwarded_from=display_name(headers.get("from", "")),
                       forwarded_subject=headers.get("subject", ""), forwarded_body=new)
    new, history = _split_reply(text)
    if history:
        return Reading("reply", new, history, max(1, _count_markers(history) + (0 if reply else 1)))
    if is_fwd_subject:
        return Reading("forward", "", "", 0, forwarded_body=new)
    is_reply = in_reply_to or bool(re.match(r"^\s*re\s*:", subject, re.I))
    return Reading("reply" if is_reply else "new", new, "", 0)


# ---------------------------------------------------------------- earlier messages, one by one

_GMAIL_HEADER = re.compile(
    r"^[ \t]*On\s(?P<when>[^\n]{4,200}?),?\s(?P<who>[^,\n]*?<[^>\n]+>|[^,\n]+?)\s*\n?\s*wrote:[ \t]*$", re.M | re.I)
_BLOCK_HEADER = re.compile(r"^[ \t]*_{8,}[ \t]*\n|^[ \t]*-{2,}\s*Original Message\s*-{2,}[ \t]*\n", re.M | re.I)


_WRAPPED_WROTE = re.compile(r"^([ \t]*On\s[^\n]{4,200})\n([^\n]{0,160}\swrote:[ \t]*)$", re.M | re.I)


@dataclass(frozen=True, slots=True)
class ThreadMessage:
    sender: str  # display name, or the address
    sent: str  # the date as the email client wrote it
    text: str


def thread_messages(history: str, *, limit: int = 20) -> list[ThreadMessage]:
    """Split quoted history into the earlier messages (newest first), each with who wrote it and when."""
    text = _BLOCK_HEADER.sub("", history.strip())
    text = _WRAPPED_WROTE.sub(lambda m: f"{m.group(1).rstrip()} {m.group(2).lstrip()}".replace("< ", "<"), text)
    starts = sorted({m.start() for p in _REPLY_MARKERS for m in p.finditer(text)})
    if not starts or starts[0] > 0:
        starts = [0, *starts]
    out: list[ThreadMessage] = []
    for i, start in enumerate(starts):
        block = text[start: starts[i + 1] if i + 1 < len(starts) else len(text)].strip()
        sender = sent = ""
        if match := _GMAIL_HEADER.match(block):
            sender, sent = display_name(match.group("who")), match.group("when").strip()
            block = block[match.end():]
        else:
            lines = block.split("\n")
            j = 0
            while j < len(lines) and (header := _FORWARD_HEADER.match(lines[j])):
                key, value = header.group(1).lower(), header.group(2).strip()
                sender = display_name(value) if key == "from" else sender
                sent = value if key in ("sent", "date") else sent
                j += 1
            block = "\n".join(lines[j:])
        body = re.sub(r"\n\s*\n+", "\n\n", block).strip()
        if body:
            out.append(ThreadMessage(sender, sent, body))
        if len(out) == limit:
            break
    return out
