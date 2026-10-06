"""Find dates that matter in important emails: exams, interviews, due dates, flights. Pure, no I/O.

Two sources:
- Calendar invites (text/calendar parts or .ics attachments): exact, confidence 1.0.
- The subject and body text: date expressions plus context keywords in the same sentence. Dates without a
  keyword are kept as low-confidence suggestions that the user confirms with one tap.
"""

import re
from dataclasses import dataclass, replace
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from icalendar import Calendar

from app.models import EventKind

MONTHS = {m: i for i, names in enumerate([
    ("jan", "january"), ("feb", "february"), ("mar", "march"), ("apr", "april"), ("may",), ("jun", "june"),
    ("jul", "july"), ("aug", "august"), ("sep", "sept", "september"), ("oct", "october"), ("nov", "november"),
    ("dec", "december"),
], 1) for m in names}
_MONTH = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|" \
         r"oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
_WEEKDAY = r"(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?\.?,?\s+)?"
_ORD = r"(?:st|nd|rd|th)?"
_PATTERNS = [
    # 12 Oct 2026, 12th October, 12-Oct-26
    ("dmy", re.compile(
        rf"\b{_WEEKDAY}(\d{{1,2}}){_ORD}(?:\s+of)?[\s\-./]+{_MONTH}\.?(?:[\s\-./,]+(\d{{4}}|\d{{2}}))?\b", re.I)),
    # October 12, 2026 / Oct 12
    ("mdy", re.compile(rf"\b{_WEEKDAY}{_MONTH}\.?\s+(\d{{1,2}}){_ORD}(?:,?\s+(\d{{4}}))?\b", re.I)),
    # 2026-10-12
    ("iso", re.compile(r"\b(20\d{2})-(\d{1,2})-(\d{1,2})\b")),
    # 12/10/2026, 12.10.26
    ("num", re.compile(r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](20\d{2}|\d{2})\b")),
    ("rel", re.compile(r"\b(today|tomorrow)\b", re.I)),
]
_TIME_NEAR = re.compile(
    r"(?:at|@|from|by|time[:\s]*|timing[:\s]*|,)?\s*\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|hrs|hours|ist)\b"
    r"|\b(?:at|@|from|time[:\s]*)\s*(\d{1,2})[:.](\d{2})\b",
    re.I,
)
# Checked in order: specific phrases first, so "last date to pay the exam fee" is a deadline, not an exam.
KEYWORDS: list[tuple[EventKind, tuple[str, ...]]] = [
    (EventKind.deadline, ("deadline", "last date", "due date", "due on", "due by", "apply by", "register by",
                          "closes on", "closing date", "last day")),
    (EventKind.payment, ("payment", "fee", "fees", "bill", "emi", "premium", "due amount", "amount due",
                         "pay by", "renewal")),
    (EventKind.interview, ("interview", "hr round", "technical round", "coding round", "screening call",
                           "assessment")),
    (EventKind.exam, ("exam", "examination", "test", "viva", "quiz", "paper", "admit card", "hall ticket",
                      "practical", "mid-sem", "midsem", "end-sem", "endsem")),
    (EventKind.travel, ("flight", "departure", "departs", "boarding", "check-in", "train", "pnr", "journey",
                        "arrival", "bus")),
    (EventKind.meeting, ("meeting", "webinar", "session", "class", "lecture", "orientation", "call", "event",
                         "workshop", "seminar", "appointment", "scheduled")),
    (EventKind.deadline, ("submit", "submission", "before", "expires", "expiry", "registration")),
]
_SENTENCE = re.compile(r"(?<=[.!?\n])\s+")
_QUOTED_HISTORY = re.compile(r"^(on .{4,80} wrote:|-{2,}\s*original message|from:\s.+\nsent:)", re.I | re.M)
MAX_EVENTS = 3
MAX_TEXT = 20_000


@dataclass(frozen=True, slots=True)
class FoundEvent:
    kind: EventKind
    title: str
    starts_at: datetime
    all_day: bool
    confidence: float
    source: str
    context: str | None = None
    ends_at: datetime | None = None
    location: str | None = None
    ics_uid: str | None = None
    cancelled: bool = False


# ---------------------------------------------------------------- calendar invites


def from_ics(data: bytes | str, *, zone: ZoneInfo) -> list[FoundEvent]:
    try:
        cal = Calendar.from_ical(data)
    except (ValueError, KeyError, IndexError, TypeError):
        return []
    cancelled = str(cal.get("METHOD", "")).upper() == "CANCEL"
    found: list[FoundEvent] = []
    for ev in cal.walk("VEVENT"):
        start = ev.decoded("DTSTART", None)
        if start is None:
            continue
        end = ev.decoded("DTEND", None)
        all_day = not isinstance(start, datetime)
        found.append(FoundEvent(
            kind=_kind_of(str(ev.get("SUMMARY", "")))[0] or EventKind.meeting,
            title=_clip(str(ev.get("SUMMARY", "")) or "Calendar invite", 200),
            starts_at=_aware(start, zone), ends_at=_aware(end, zone) if end is not None else None,
            all_day=all_day, confidence=1.0, source="ics", location=_clip(str(ev.get("LOCATION", "")), 300) or None,
            ics_uid=str(ev.get("UID", "")) or None,
            cancelled=cancelled or str(ev.get("STATUS", "")).upper() == "CANCELLED",
        ))
    return found


def _aware(value: date | datetime, zone: ZoneInfo) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=zone)
    return datetime.combine(value, time(0, 0), tzinfo=zone)


# ---------------------------------------------------------------- text


def _clip(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _kind_of(sentence: str) -> tuple[EventKind | None, str | None]:
    lowered = sentence.lower()
    for kind, words in KEYWORDS:
        for word in words:
            if re.search(rf"(?<![a-z]){re.escape(word)}(?![a-z])", lowered):
                return kind, word
    return None, None


def _year_for(day: int, month: int, received: date) -> int:
    """No year given: the next occurrence on or after the email date (a December email about 'Jan 5')."""
    candidate = date(received.year, month, day) if _valid(received.year, month, day) else None
    if candidate and candidate >= received - timedelta(days=1):
        return received.year
    return received.year + 1


def _valid(year: int, month: int, day: int) -> bool:
    try:
        date(year, month, day)
    except ValueError:
        return False
    return True


def _dates_in(sentence: str, *, received: date, day_first: bool) -> list[tuple[date, int, int]]:
    """(date, start, end) for every date expression in the sentence."""
    found: list[tuple[date, int, int]] = []
    taken: list[tuple[int, int]] = []
    for name, pattern in _PATTERNS:
        for m in pattern.finditer(sentence):
            if any(a < m.end() and m.start() < b for a, b in taken):
                continue
            year: int | None = None
            if name == "dmy":
                day, month = int(m.group(1)), MONTHS.get(m.group(2).lower().rstrip("."), 0)
                year = int(m.group(3)) if m.group(3) else None
            elif name == "mdy":
                month, day = MONTHS.get(m.group(1).lower().rstrip("."), 0), int(m.group(2))
                year = int(m.group(3)) if m.group(3) else None
            elif name == "iso":
                year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
            elif name == "num":
                a, b = int(m.group(1)), int(m.group(2))
                year = int(m.group(3))
                if a > 12:
                    day, month = a, b
                elif b > 12:
                    day, month = b, a
                else:
                    day, month = (a, b) if day_first else (b, a)
            else:
                word = m.group(1).lower()
                value = received + timedelta(days=1 if word == "tomorrow" else 0)
                found.append((value, m.start(), m.end()))
                taken.append((m.start(), m.end()))
                continue
            if year is not None and year < 100:
                year += 2000
            if not month:
                continue
            year = year or _year_for(day, month, received)
            if not _valid(year, month, day):
                continue
            found.append((date(year, month, day), m.start(), m.end()))
            taken.append((m.start(), m.end()))
    return found


def _time_near(sentence: str, start: int, end: int) -> time | None:
    """A clock time within ~40 characters after (or 25 before) the date."""
    window = sentence[max(0, start - 25): end + 40]
    offset = max(0, start - 25)
    best: tuple[int, time] | None = None
    for m in _TIME_NEAR.finditer(window):
        if m.group(1):
            hour, minute, mer = int(m.group(1)), int(m.group(2) or 0), m.group(3).lower().replace(".", "")
            if mer == "pm" and hour < 12:
                hour += 12
            elif mer == "am" and hour == 12:
                hour = 0
        else:
            hour, minute = int(m.group(4)), int(m.group(5))
        if hour > 23 or minute > 59:
            continue
        distance = abs((offset + m.start()) - end)
        if best is None or distance < best[0]:
            best = (distance, time(hour, minute))
    return best[1] if best else None


def strip_quoted(body: str) -> str:
    """Drop forwarded/replied history so old dates in the thread don't create events."""
    match = _QUOTED_HISTORY.search(body)
    text = body[: match.start()] if match else body
    return "\n".join(line for line in text.splitlines() if not line.lstrip().startswith(">"))


def from_text(
    subject: str, body: str, *, received_at: datetime, zone: ZoneInfo, day_first: bool = True,
) -> list[FoundEvent]:
    received_local = received_at.astimezone(zone)
    received = received_local.date()
    subject_kind, _ = _kind_of(subject)
    text = f"{subject}.\n{strip_quoted(body or '')[:MAX_TEXT]}"
    candidates: dict[datetime, FoundEvent] = {}
    for sentence in _SENTENCE.split(text):
        sentence = sentence.strip()
        if not sentence or len(sentence) > 600:
            continue
        hits = _dates_in(sentence, received=received, day_first=day_first)
        if not hits:
            continue
        kind, _ = _kind_of(sentence)
        for day, start, end in hits:
            if day < received or day > received + timedelta(days=730):
                continue
            clock = _time_near(sentence, start, end)
            if clock is None:
                starts_at = datetime.combine(day, time(0, 0), tzinfo=zone)
            else:
                starts_at = datetime.combine(day, clock, tzinfo=zone)
                if starts_at < received_local:
                    continue
            confidence = 0.9 if kind else (0.6 if subject_kind else 0.35)
            if clock is not None:
                confidence = min(1.0, confidence + 0.05)
            event_kind = kind or subject_kind or EventKind.other
            event = FoundEvent(
                kind=event_kind, title=_title(event_kind, subject, sentence), starts_at=starts_at,
                all_day=clock is None, confidence=round(confidence, 2), source="text", context=_clip(sentence, 300),
            )
            existing = candidates.get(starts_at)
            if existing is None or existing.confidence < event.confidence:
                candidates[starts_at] = event
    # A dated and an all-day event on the same day: keep the timed one.
    timed_days = {e.starts_at.date() for e in candidates.values() if not e.all_day}
    events = [e for e in candidates.values() if not (e.all_day and e.starts_at.date() in timed_days)]
    events.sort(key=lambda e: (-e.confidence, e.starts_at))
    events = events[:MAX_EVENTS]
    if len(events) > 1:
        # Several dates in one email: the subject alone can't tell them apart, so use each one's sentence.
        events = [replace(e, title=_title(e.kind, "", e.context or e.title)) for e in events]
    return events


LABELS = {EventKind.exam: "Exam", EventKind.interview: "Interview", EventKind.deadline: "Deadline",
          EventKind.payment: "Payment due", EventKind.travel: "Travel", EventKind.meeting: "Event",
          EventKind.other: "Date"}


def _title(kind: EventKind, subject: str, sentence: str) -> str:
    base = subject.strip() or sentence
    base = re.sub(r"^(re|fw|fwd)\s*:\s*", "", base, flags=re.I)
    return _clip(base, 160) if kind == EventKind.other else _clip(f"{LABELS[kind]}: {base}", 160)


def day_first_for(timezone: str) -> bool:
    """dd/mm/yyyy almost everywhere except the US (and a few others)."""
    return not timezone.startswith(("America/", "US/")) or timezone.startswith(
        ("America/Sao_Paulo", "America/Argentina", "America/Bogota", "America/Lima", "America/Santiago"))

