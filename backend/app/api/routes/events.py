"""Deadline radar: upcoming exams, interviews and due dates, plus a private calendar feed."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import Response
from icalendar import Calendar
from icalendar import Event as IcsEvent
from sqlalchemy import select

from app.api.deps import DB, CurrentUser
from app.api.schemas import CalendarFeedOut, EventCreate, EventOut, EventUpdate
from app.core.config import get_settings
from app.core.db import uuid7
from app.core.errors import AppError, NotFound
from app.core.security import new_opaque_token
from app.models import Event, EventStatus, Message, User, UserSettings
from app.services import deadlines

router = APIRouter(prefix="/deadlines", tags=["deadlines"])
public_router = APIRouter(tags=["deadlines"])


async def _get(db: DB, user_id: UUID, event_id: UUID) -> Event:
    event = await db.get(Event, event_id)
    if event is None or event.user_id != user_id:
        raise NotFound("Event not found")
    return event


async def _out(db: DB, events: list[Event]) -> list[EventOut]:
    ids = [e.message_id for e in events if e.message_id]
    info = {m.id: (m.subject, m.ref) for m in (await db.scalars(select(Message).where(Message.id.in_(ids)))).all()} \
        if ids else {}
    return [EventOut.model_validate(e).model_copy(update={
        "message_subject": info.get(e.message_id, (None, None))[0] if e.message_id else None,
        "message_ref": info.get(e.message_id, (None, None))[1] if e.message_id else None,
    }) for e in events]


@router.get("", response_model=list[EventOut])
async def list_events(
    user: CurrentUser, db: DB, status: list[EventStatus] | None = Query(None),
    start: datetime | None = Query(None, alias="from"), end: datetime | None = Query(None, alias="to"),
    limit: int = Query(200, ge=1, le=500),
) -> list[EventOut]:
    """Defaults: suggested and upcoming events from 12 hours ago onwards."""
    stmt = select(Event).where(Event.user_id == user.id)
    stmt = stmt.where(Event.status.in_(status or [EventStatus.suggested, EventStatus.upcoming]))
    stmt = stmt.where(Event.starts_at >= (start or datetime.now(UTC) - timedelta(hours=12)))
    if end:
        stmt = stmt.where(Event.starts_at <= end)
    rows = (await db.scalars(stmt.order_by(Event.starts_at).limit(limit))).all()
    return await _out(db, list(rows))


@router.post("", response_model=EventOut, status_code=201)
async def create_event(body: EventCreate, user: CurrentUser, db: DB) -> EventOut:
    if body.message_id:
        message = await db.get(Message, body.message_id)
        if message is None or message.user_id != user.id:
            raise NotFound("Message not found")
    event = Event(id=uuid7(), user_id=user.id, source="manual", confidence=1.0, status=EventStatus.upcoming,
                  **body.model_dump())
    db.add(event)
    await db.flush()
    await deadlines.schedule_reminders(db, user, event, ref=await deadlines.ref_for(db, event.message_id))
    await db.commit()
    return (await _out(db, [event]))[0]


@router.patch("/{event_id}", response_model=EventOut)
async def update_event(event_id: UUID, body: EventUpdate, user: CurrentUser, db: DB) -> EventOut:
    event = await _get(db, user.id, event_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None or key in ("location", "ends_at"):
            setattr(event, key, value)
    if event.ends_at and event.ends_at <= event.starts_at:
        raise AppError("The end must be after the start", code="invalid_time", status=422)
    await db.flush()
    await deadlines.schedule_reminders(db, user, event, ref=await deadlines.ref_for(db, event.message_id))
    await db.commit()
    await db.refresh(event)
    return (await _out(db, [event]))[0]


@router.delete("/{event_id}", status_code=204)
async def delete_event(event_id: UUID, user: CurrentUser, db: DB) -> None:
    event = await _get(db, user.id, event_id)
    await deadlines.cancel_reminders(db, event.id)
    await db.delete(event)
    await db.commit()


def _feed(token: str) -> CalendarFeedOut:
    url = f"{get_settings().public_api_url.rstrip('/')}/api/v1/calendar/{token}.ics"
    return CalendarFeedOut(url=url, webcal_url="webcal://" + url.split("://", 1)[-1])


async def _prefs(db: DB, user: User) -> UserSettings:
    prefs = await db.get(UserSettings, user.id)
    if prefs is None:
        prefs = UserSettings(user_id=user.id, quiet_hours={}, digest={})
        db.add(prefs)
        await db.flush()
    return prefs


@router.get("/calendar", response_model=CalendarFeedOut)
async def calendar_feed(user: CurrentUser, db: DB) -> CalendarFeedOut:
    prefs = await _prefs(db, user)
    if not prefs.calendar_token:
        prefs.calendar_token = new_opaque_token()
        await db.commit()
    return _feed(str(prefs.calendar_token))


@router.post("/calendar/rotate", response_model=CalendarFeedOut)
async def rotate_calendar_feed(user: CurrentUser, db: DB) -> CalendarFeedOut:
    """Invalidate the old link (if it was shared by mistake) and issue a new one."""
    prefs = await _prefs(db, user)
    prefs.calendar_token = new_opaque_token()
    await db.commit()
    return _feed(str(prefs.calendar_token))


@public_router.get("/calendar/{token}.ics", include_in_schema=False)
async def calendar_ics(token: str, db: DB) -> Response:
    """Public by design (calendar apps can't log in); the unguessable token is the credential."""
    prefs = await db.scalar(select(UserSettings).where(UserSettings.calendar_token == token)) if len(token) >= 20 \
        else None
    if prefs is None:
        raise NotFound("Calendar not found")
    rows = (await db.scalars(select(Event).where(
        Event.user_id == prefs.user_id, Event.status.in_([EventStatus.upcoming, EventStatus.done]),
        Event.starts_at >= datetime.now(UTC) - timedelta(days=30),
    ).order_by(Event.starts_at).limit(500))).all()
    cal = Calendar()
    cal.add("prodid", "-//MailSentinel//Deadline radar//EN")
    cal.add("version", "2.0")
    cal.add("x-wr-calname", "MailSentinel")
    cal.add("refresh-interval;value=duration", "PT1H")
    web = get_settings().public_web_url.rstrip("/")
    for e in rows:
        item = IcsEvent()
        item.add("uid", f"{e.id}@mailsentinel")
        item.add("summary", e.title)
        if e.all_day:
            item.add("dtstart", e.starts_at.date())
            item.add("dtend", (e.starts_at + timedelta(days=1)).date())
        else:
            item.add("dtstart", e.starts_at)
            item.add("dtend", e.ends_at or e.starts_at + timedelta(hours=1))
        if e.location:
            item.add("location", e.location)
        description = (e.context or "") + (f"\n\n{web}/messages/{e.message_id}" if e.message_id else "")
        if description.strip():
            item.add("description", description.strip())
        item.add("dtstamp", e.updated_at)
        cal.add_component(item)
    return Response(cal.to_ical(), media_type="text/calendar; charset=utf-8",
                    headers={"Cache-Control": "private, max-age=300"})
