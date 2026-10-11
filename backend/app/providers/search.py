"""Searching a mailbox with its own search engine, from one provider-neutral query.

The mail assistant turns "the email where Abhi and I discussed the API, sometime last month" into a
SearchQuery; each provider translates it into its native syntax (Gmail's search operators, IMAP SEARCH). Mail is
searched live and never copied or indexed, so nothing new about a mailbox is stored.
"""

import re
from dataclasses import dataclass, field
from datetime import date, timedelta

MAX_TERMS = 6
MAX_TERM_CHARS = 80


@dataclass(frozen=True, slots=True)
class SearchQuery:
    sender: str = ""  # a name or address fragment: "abhi", "abhi@acme.com", "acme.com"
    recipient: str = ""
    subject: str = ""  # words that should be in the subject
    words: tuple[str, ...] = field(default_factory=tuple)  # words or phrases anywhere in the email
    after: date | None = None  # on or after
    before: date | None = None  # before (exclusive)
    has_attachment: bool | None = None

    @property
    def is_empty(self) -> bool:
        return not (self.sender or self.recipient or self.subject or self.words or self.after or self.before
                    or self.has_attachment)

    def describe(self) -> str:
        """Plain words for status lines: 'from abhi · about "api" · after 1 Sep'."""
        parts = []
        if self.sender:
            parts.append(f"from {self.sender}")
        if self.recipient:
            parts.append(f"to {self.recipient}")
        if self.subject:
            parts.append(f'subject "{self.subject}"')
        if self.words:
            parts.append("about " + ", ".join(f'"{w}"' for w in self.words))
        if self.after:
            parts.append(f"after {self.after:%d %b %Y}")
        if self.before:
            parts.append(f"before {self.before:%d %b %Y}")
        if self.has_attachment:
            parts.append("with attachments")
        return " · ".join(parts) or "recent mail"


def clean_term(value: str) -> str:
    """Collapse whitespace and drop characters that carry meaning in search syntaxes."""
    value = re.sub(r'["\\(){}\[\]<>]', " ", value or "")
    return " ".join(value.split())[:MAX_TERM_CHARS]


def normalise(query: SearchQuery) -> SearchQuery:
    words = tuple(dict.fromkeys(w for w in (clean_term(w) for w in query.words) if w))[:MAX_TERMS]
    return SearchQuery(sender=clean_term(query.sender), recipient=clean_term(query.recipient),
                       subject=clean_term(query.subject), words=words, after=query.after, before=query.before,
                       has_attachment=query.has_attachment)


def _gmail_term(value: str) -> str:
    return f'"{value}"' if " " in value else value


def gmail_query(query: SearchQuery) -> str:
    """Gmail search operators, e.g. 'from:abhi subject:(api) "rate limit" after:2026/09/01 -in:chats'."""
    q = normalise(query)
    parts: list[str] = []
    if q.sender:
        parts.append(f"from:{_gmail_term(q.sender)}")
    if q.recipient:
        parts.append(f"to:{_gmail_term(q.recipient)}")
    if q.subject:
        parts.append(f"subject:({q.subject})")
    parts += [_gmail_term(w) for w in q.words]
    if q.after:
        parts.append(f"after:{q.after:%Y/%m/%d}")
    if q.before:
        parts.append(f"before:{q.before:%Y/%m/%d}")
    if q.has_attachment:
        parts.append("has:attachment")
    parts.append("-in:chats")
    return " ".join(parts)


_IMAP_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _imap_date(d: date) -> str:
    return f"{d.day:02d}-{_IMAP_MONTHS[d.month - 1]}-{d.year}"


def _imap_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def imap_criteria(query: SearchQuery) -> tuple[str, bool]:
    """IMAP SEARCH criteria (all terms must match) and whether they need CHARSET UTF-8."""
    q = normalise(query)
    parts: list[str] = []
    if q.sender:
        parts.append(f"FROM {_imap_string(q.sender)}")
    if q.recipient:
        parts.append(f"TO {_imap_string(q.recipient)}")
    if q.subject:
        parts.append(f"SUBJECT {_imap_string(q.subject)}")
    parts += [f"TEXT {_imap_string(w)}" for w in q.words]
    if q.after:
        parts.append(f"SINCE {_imap_date(q.after)}")
    if q.before:
        parts.append(f"BEFORE {_imap_date(q.before)}")
    criteria = " ".join(parts) or f"SINCE {_imap_date(date.today() - timedelta(days=30))}"
    return criteria, not criteria.isascii()
