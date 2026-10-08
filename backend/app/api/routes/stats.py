import asyncio
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import and_, func, select
from sse_starlette import EventSourceResponse

from app.api.deps import DB, CurrentUser, stream_user_id
from app.api.schemas import ActivityDay, DashboardStats, DayStat, NamedCount, Overview
from app.core.redis import Keys, get_redis
from app.models import (
    Event,
    EventStatus,
    Mailbox,
    Message,
    Notification,
    NotificationKind,
    NotificationStatus,
    OutboundEmail,
    OutboundStatus,
    Rule,
    RuleMatch,
)
from app.services.events import daily_stats
from app.services.schedule import tz

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


ALERT_KINDS = [NotificationKind.alert, NotificationKind.digest, NotificationKind.reminder]
OUT_STATUSES = [NotificationStatus.sent, NotificationStatus.delivered, NotificationStatus.read]


@router.get("/stats/dashboard", response_model=DashboardStats)
async def dashboard(user: CurrentUser, db: DB, days: int = Query(7, ge=1, le=90)) -> DashboardStats:
    """Everything the dashboard shows for the last `days` days, compared with the `days` before."""
    zone = user.timezone or "UTC"
    now = datetime.now(UTC)
    start, prev_start = now - timedelta(days=days), now - timedelta(days=2 * days)

    def window(col, lo, hi):
        return and_(col >= lo, col < hi)

    important, important_prev, summarized = (await db.execute(select(
        func.count().filter(window(Message.received_at, start, now)),
        func.count().filter(window(Message.received_at, prev_start, start)),
        func.count().filter(window(Message.received_at, start, now), Message.ai_summary.is_not(None)),
    ).where(Message.user_id == user.id))).one()
    alerts, alerts_prev, finished, read = (await db.execute(select(
        func.count().filter(window(Notification.created_at, start, now), Notification.status.in_(OUT_STATUSES)),
        func.count().filter(window(Notification.created_at, prev_start, start),
                            Notification.status.in_(OUT_STATUSES)),
        func.count().filter(window(Notification.created_at, start, now),
                            Notification.status.in_([*OUT_STATUSES, NotificationStatus.dead])),
        func.count().filter(window(Notification.created_at, start, now),
                            Notification.status == NotificationStatus.read),
    ).where(Notification.user_id == user.id, Notification.kind.in_(ALERT_KINDS)))).one()
    emails_sent, emails_sent_prev = (await db.execute(select(
        func.count().filter(window(OutboundEmail.sent_at, start, now)),
        func.count().filter(window(OutboundEmail.sent_at, prev_start, start)),
    ).where(OutboundEmail.user_id == user.id, OutboundEmail.status == OutboundStatus.sent))).one()
    upcoming = await db.scalar(select(func.count()).select_from(Event).where(
        Event.user_id == user.id, Event.status.in_([EventStatus.upcoming, EventStatus.suggested]),
        Event.starts_at >= now, Event.starts_at <= now + timedelta(days=30))) or 0

    def day_of(col):
        return func.to_char(func.timezone(zone, col), "YYYY-MM-DD")

    per_day: dict[str, dict[str, int]] = {}
    received, alerted, mailed = (day_of(Message.received_at), day_of(Notification.created_at),
                                 day_of(OutboundEmail.sent_at))
    for label, stmt in (
        ("important", select(received, func.count()).where(
            Message.user_id == user.id, Message.received_at >= start).group_by(received)),
        ("alerts", select(alerted, func.count()).where(
            Notification.user_id == user.id, Notification.created_at >= start,
            Notification.kind.in_(ALERT_KINDS), Notification.status.in_(OUT_STATUSES)).group_by(alerted)),
        ("emails_sent", select(mailed, func.count()).where(
            OutboundEmail.user_id == user.id, OutboundEmail.sent_at >= start,
            OutboundEmail.status == OutboundStatus.sent).group_by(mailed)),
    ):
        for day, count in (await db.execute(stmt)).all():
            per_day.setdefault(day, {})[label] = count
    today = now.astimezone(tz(zone)).date()
    activity = [ActivityDay(date=(d := (today - timedelta(days=i)).isoformat()),
                            important=per_day.get(d, {}).get("important", 0),
                            alerts=per_day.get(d, {}).get("alerts", 0),
                            emails_sent=per_day.get(d, {}).get("emails_sent", 0))
                for i in range(days - 1, -1, -1)]

    by_rule = [NamedCount(name=name, count=count) for name, count in (await db.execute(
        select(RuleMatch.rule_name, func.count()).join(Message, Message.id == RuleMatch.message_id)
        .where(Message.user_id == user.id, Message.received_at >= start)
        .group_by(RuleMatch.rule_name).order_by(func.count().desc()).limit(8))).all()]
    top_senders = [NamedCount(name=name or address, address=address, count=count) for address, name, count in (
        await db.execute(select(Message.from_address, func.max(Message.from_name), func.count())
                         .where(Message.user_id == user.id, Message.received_at >= start)
                         .group_by(Message.from_address).order_by(func.count().desc()).limit(5))).all()]
    return DashboardStats(
        period_days=days, important=important, important_prev=important_prev, alerts=alerts,
        alerts_prev=alerts_prev, emails_sent=emails_sent, emails_sent_prev=emails_sent_prev, upcoming=upcoming,
        delivery_rate=(alerts / finished) if finished else None, read_rate=(read / alerts) if alerts else None,
        summarized_rate=(summarized / important) if important else None,
        activity=activity, by_rule=by_rule, top_senders=top_senders)


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
