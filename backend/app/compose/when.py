"""Parse the human times people type on WhatsApp: "2h", "tomorrow 9am", "mon 8:30", "in 3 days"."""

import re
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

WEEKDAYS = {name: i for i, names in enumerate([
    ("mon", "monday"), ("tue", "tues", "tuesday"), ("wed", "wednesday"), ("thu", "thur", "thurs", "thursday"),
    ("fri", "friday"), ("sat", "saturday"), ("sun", "sunday"),
]) for name in names}
UNITS = {"m": 1, "min": 1, "mins": 1, "minute": 1, "minutes": 1, "h": 60, "hr": 60, "hrs": 60, "hour": 60,
         "hours": 60, "d": 1440, "day": 1440, "days": 1440, "w": 10080, "week": 10080, "weeks": 10080}
_DURATION = re.compile(r"^(?:in\s+)?(\d{1,3})\s*([a-z]+)$")
_TIME = re.compile(r"^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$")
DEFAULT_TIME = time(9, 0)
MAX_AHEAD = timedelta(days=366)


def parse_clock(text: str) -> time | None:
    match = _TIME.match(text.strip().lower())
    if not match:
        return None
    hour, minute = int(match.group(1)), int(match.group(2) or 0)
    meridiem = (match.group(3) or "").replace(".", "")
    if meridiem == "pm" and hour < 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0
    elif not meridiem and match.group(2) is None and hour < 7:
        hour += 12  # "remind at 5" almost always means 5 pm
    if hour > 23 or minute > 59:
        return None
    return time(hour, minute)


def parse_when(text: str, *, now: datetime, zone: ZoneInfo) -> datetime | None:
    """Return an aware datetime in the future, or None if the text isn't understood."""
    raw = " ".join(text.strip().lower().replace(",", " ").split())
    if not raw:
        return None
    local_now = now.astimezone(zone)

    if (match := _DURATION.match(raw)) and match.group(2) in UNITS:
        amount = int(match.group(1))
        if amount <= 0:
            return None
        result = now + timedelta(minutes=amount * UNITS[match.group(2)])
        return result if result - now <= MAX_AHEAD else None
    if raw in ("later", "soon"):
        return now + timedelta(hours=3)
    if raw == "tonight":
        target = datetime.combine(local_now.date(), time(20, 0), tzinfo=zone)
        return target if target > now else None
    if raw in ("next week",):
        days = 7 - local_now.weekday()
        return datetime.combine(local_now.date() + timedelta(days=days), DEFAULT_TIME, tzinfo=zone)

    words = raw.removeprefix("on ").removeprefix("at ").split(" ")
    day_word, rest = words[0], " ".join(words[1:]).removeprefix("at ").strip()
    clock: time | None
    if day_word in ("today", "tomorrow", "tmrw", "tmr") or day_word in WEEKDAYS:
        clock = parse_clock(rest) if rest else DEFAULT_TIME
        if clock is None:
            return None
        if day_word == "today":
            day = local_now.date()
        elif day_word in ("tomorrow", "tmrw", "tmr"):
            day = local_now.date() + timedelta(days=1)
        else:
            ahead = (WEEKDAYS[day_word] - local_now.weekday()) % 7 or 7
            day = local_now.date() + timedelta(days=ahead)
        target = datetime.combine(day, clock, tzinfo=zone)
        return target if target > now else None

    # A bare clock time: today if it is still ahead, otherwise tomorrow.
    clock = parse_clock(raw.removeprefix("at ").strip())
    if clock is None:
        return None
    target = datetime.combine(local_now.date(), clock, tzinfo=zone)
    return target if target > now else target + timedelta(days=1)


def describe(when: datetime, *, now: datetime, zone: ZoneInfo) -> str:
    """'today 18:00', 'tomorrow 09:00', 'Mon 12 Oct 09:00'."""
    local, local_now = when.astimezone(zone), now.astimezone(zone)
    clock = local.strftime("%H:%M")
    if local.date() == local_now.date():
        return f"today {clock}"
    if local.date() == local_now.date() + timedelta(days=1):
        return f"tomorrow {clock}"
    return local.strftime("%a %d %b ") + clock
