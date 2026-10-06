"""Deadline radar: store dates found in important emails and remind the user before them.

Reminders are ordinary outbox rows (kind=reminder) with a future next_attempt_at, so the dispatcher sends them
on time with the same retries and limits as alerts. Moving or dismissing an event cancels its queued reminders.
"""

from datetime import UTC, datetime, time, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import uuid7
from app.events.extract import FoundEvent, day_first_for, from_ics, from_text
from app.models import (
    Event,
    EventStatus,
    Message,
    Notification,
    NotificationKind,
    NotificationStatus,
    User,
)
from app.rules.envelope import Envelope
from app.services import outbox
from app.services.schedule import tz

AUTO_CONFIRM = 0.7  # below this, an event is a suggestion: shown in the app, no reminders
MAX_PENDING_REMINDERS = 200


def event_brief(event: Event) -> dict[str, Any]:
    return {"id": str(event.id), "kind": event.kind.value, "title": event.title,
            "starts_at": event.starts_at.isoformat(), "all_day": event.all_day, "location": event.location,
            "reminders": event.status == EventStatus.upcoming}


def reminder_times(event: Event, timezone: str, now: datetime) -> list[tuple[str, str, datetime]]:
    """(slot, lead text, when). All-day: evening before + morning of. Timed: a day before + 2 hours before."""
    zone = tz(timezone)
    if event.all_day:
        day = event.starts_at.astimezone(zone).date()
        slots = [("eve", "Tomorrow", datetime.combine(day - timedelta(days=1), time(18, 0), tzinfo=zone)),
                 ("morning", "Today", datetime.combine(day, time(7, 30), tzinfo=zone))]
    else:
        slots = [("day", "Tomorrow", event.starts_at - timedelta(days=1)),
                 ("soon", "In 2 hours", event.starts_at - timedelta(hours=2))]
    return [(slot, lead, at) for slot, lead, at in slots if at > now]


async def cancel_reminders(db: AsyncSession, event_id: UUID) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.kind == NotificationKind.reminder,
               Notification.payload["event"]["id"].astext == str(event_id),
               Notification.status.in_([NotificationStatus.queued, NotificationStatus.failed]))
        .values(status=NotificationStatus.cancelled)
    )


async def schedule_reminders(db: AsyncSession, user: User, event: Event, *, ref: str | None = None) -> int:
    """(Re)create reminders for an event. Safe to call repeatedly: dedupe keys include the start time."""
    await cancel_reminders(db, event.id)
    if event.status != EventStatus.upcoming:
        return 0
    destination = await outbox.default_destination(db, user.id)
    if destination is None:
        return 0
    created = 0
    for slot, lead, at in reminder_times(event, user.timezone, datetime.now(UTC)):
        payload = {"event": event_brief(event), "lead": lead, "ref": ref, "timezone": user.timezone,
                   "message_id": str(event.message_id) if event.message_id else None}
        created += await outbox.enqueue(
            db, user_id=user.id, destination=destination, kind=NotificationKind.reminder, payload=payload,
            dedupe=f"event:{event.id}:{slot}:{event.starts_at.isoformat()}", message_id=event.message_id,
            at=at,
        )
    # enqueue() skips rows whose dedupe key exists, even if that row was cancelled: revive those.
    await db.execute(
        update(Notification)
        .where(Notification.kind == NotificationKind.reminder,
               Notification.payload["event"]["id"].astext == str(event.id),
               Notification.status == NotificationStatus.cancelled,
               Notification.next_attempt_at > datetime.now(UTC),
               Notification.payload["event"]["starts_at"].astext == event.starts_at.isoformat())
        .values(status=NotificationStatus.queued)
    )
    return created


def detect(env: Envelope, timezone: str) -> list[FoundEvent]:
    zone = tz(timezone)
    found: list[FoundEvent] = []
    for part in env.calendars:
        found += from_ics(part, zone=zone)
    if not found:  # an invite is authoritative; text dates in an invite email are just the invite repeated
        found = from_text(env.subject, env.body_text or env.snippet or "", received_at=env.received_at, zone=zone,
                          day_first=day_first_for(timezone))
    return found


async def store_found(
    db: AsyncSession, user: User, message_id: UUID, found: list[FoundEvent], *, ref: str | None,
) -> list[Event]:
    """Insert (or update, for calendar invites) the events found in one message."""
    stored: list[Event] = []
    for f in found:
        event: Event | None = None
        if f.ics_uid:
            event = await db.scalar(select(Event).where(Event.user_id == user.id, Event.ics_uid == f.ics_uid))
        if f.cancelled:
            if event is not None:
                event.status = EventStatus.dismissed
                await cancel_reminders(db, event.id)
            continue
        status = EventStatus.upcoming if f.confidence >= AUTO_CONFIRM else EventStatus.suggested
        if event is None:
            exists = await db.scalar(select(Event.id).where(Event.message_id == message_id,
                                                            Event.starts_at == f.starts_at))
            if exists:
                continue
            event = Event(id=uuid7(), user_id=user.id, message_id=message_id, source=f.source, kind=f.kind,
                          title=f.title, context=f.context, starts_at=f.starts_at, ends_at=f.ends_at,
                          all_day=f.all_day, location=f.location, confidence=f.confidence, status=status,
                          ics_uid=f.ics_uid)
            db.add(event)
            await db.flush()
        else:  # an updated invite: new time, title or place
            event.title, event.starts_at, event.ends_at = f.title, f.starts_at, f.ends_at
            event.all_day, event.location, event.message_id = f.all_day, f.location, message_id
            if event.status == EventStatus.dismissed:
                event.status = EventStatus.upcoming
        await schedule_reminders(db, user, event, ref=ref)
        stored.append(event)
    return stored


async def ref_for(db: AsyncSession, message_id: UUID | None) -> str | None:
    if message_id is None:
        return None
    return await db.scalar(select(Message.ref).where(Message.id == message_id))
