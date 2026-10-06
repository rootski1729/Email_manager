"""Quiet hours and digest timing in the user's own timezone."""

from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def tz(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _hhmm(value: str | None, default: time) -> time:
    try:
        hours, minutes = (value or "").split(":")
        return time(int(hours), int(minutes))
    except ValueError:
        return default


def in_quiet_hours(quiet: dict[str, Any] | None, timezone: str, now: datetime | None = None) -> bool:
    if not quiet or not quiet.get("enabled"):
        return False
    local = (now or datetime.now(UTC)).astimezone(tz(timezone)).time()
    start = _hhmm(quiet.get("start"), time(22, 0))
    end = _hhmm(quiet.get("end"), time(7, 0))
    if start == end:
        return False
    return start <= local < end if start < end else local >= start or local < end


def digest_due(
    digest: dict[str, Any] | None, timezone: str, last_sent: datetime | None, now: datetime | None = None
) -> bool:
    """True once per day, at or after the user's chosen digest time."""
    if not digest or not digest.get("enabled"):
        return False
    zone = tz(timezone)
    now = now or datetime.now(UTC)
    local_now = now.astimezone(zone)
    at = _hhmm(digest.get("time"), time(8, 0))
    today_slot = datetime.combine(local_now.date(), at, tzinfo=zone)
    latest_slot = today_slot if local_now >= today_slot else today_slot - timedelta(days=1)
    return last_sent is None or last_sent < latest_slot
