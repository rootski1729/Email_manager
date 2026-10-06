import asyncio
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sse_starlette import EventSourceResponse

from app.api.deps import DB, CurrentUser, stream_user_id
from app.api.schemas import DayStat, Overview
from app.core.redis import Keys, get_redis
from app.models import Mailbox, Message, Notification, NotificationStatus, Rule
from app.services.events import daily_stats

router = APIRouter(tags=["stats"])


async def waha_health() -> dict:
    raw = await get_redis().get(Keys.WAHA_HEALTH)
    return json.loads(raw) if raw else {"status": "UNKNOWN"}


@router.get("/stats/overview", response_model=Overview)
async def overview(user: CurrentUser, db: DB) -> Overview:
    now = datetime.now(UTC)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    mailboxes = dict((await db.execute(
        select(Mailbox.status, func.count()).where(Mailbox.user_id == user.id).group_by(Mailbox.status))).all())
    rules_total, rules_enabled = (await db.execute(
        select(func.count(), func.count().filter(Rule.enabled)).where(Rule.user_id == user.id))).one()
    matched_today, matched_7d = (await db.execute(
        select(func.count().filter(Message.created_at >= start_of_day),
               func.count().filter(Message.created_at >= now - timedelta(days=7)))
        .where(Message.user_id == user.id))).one()
    notes_24h = dict((await db.execute(
        select(Notification.status, func.count())
        .where(Notification.user_id == user.id, Notification.created_at >= now - timedelta(hours=24))
        .group_by(Notification.status))).all())
    delivered_7d, finished_7d = (await db.execute(
        select(
            func.count().filter(Notification.status.in_(
                [NotificationStatus.sent, NotificationStatus.delivered, NotificationStatus.read])),
            func.count().filter(Notification.status.in_(
                [NotificationStatus.sent, NotificationStatus.delivered, NotificationStatus.read,
                 NotificationStatus.dead])),
        ).where(Notification.user_id == user.id, Notification.created_at >= now - timedelta(days=7)))).one()
    queue_depth = await db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id,
        Notification.status.in_([NotificationStatus.queued, NotificationStatus.failed,
                                 NotificationStatus.sending]))) or 0
    return Overview(
        mailboxes={str(k): v for k, v in mailboxes.items()},
        rules_enabled=rules_enabled, rules_total=rules_total,
        matched_today=matched_today, matched_7d=matched_7d,
        notifications_24h={str(k): v for k, v in notes_24h.items()},
        delivery_rate_7d=(delivered_7d / finished_7d) if finished_7d else None,
        queue_depth=queue_depth, waha=await waha_health(),
        series=[DayStat(**d) for d in await daily_stats(user.id, 14)],
    )


@router.get("/stats/timeseries", response_model=list[DayStat])
async def timeseries(user: CurrentUser, days: int = Query(30, ge=1, le=120)) -> list[DayStat]:
    return [DayStat(**d) for d in await daily_stats(user.id, days)]


@router.get("/events", response_class=EventSourceResponse)
async def stream_events(request: Request, user_id: UUID = Depends(stream_user_id)) -> EventSourceResponse:
    """Server-sent events: message.matched, notification.updated, mailbox.updated, system."""

    async def generator() -> AsyncIterator[dict]:
        pubsub = get_redis().pubsub()
        await pubsub.subscribe(Keys.events(user_id))
        try:
            yield {"event": "ready", "data": json.dumps({"user_id": str(user_id)})}
            while not await request.is_disconnected():
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=10.0)
                if message is None:
                    await asyncio.sleep(0)
                    continue
                payload = json.loads(message["data"])
                yield {"event": payload["event"], "data": json.dumps(payload["data"])}
        finally:
            await pubsub.unsubscribe()
            await pubsub.aclose()

    return EventSourceResponse(generator(), ping=15, headers={"X-Accel-Buffering": "no"})
