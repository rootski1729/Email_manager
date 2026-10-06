"""System overview, WhatsApp (WAHA) pairing, queues and the audit log."""

import json
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Query, Request
from redis.exceptions import ResponseError
from sqlalchemy import func, select, text

from app.api.admin.schemas import AdminOverview, AuditRow, DayCount, HealthItem
from app.api.deps import DB, AdminUser, client_ip
from app.api.routes.messages import notification_out
from app.api.schemas import ComponentHealth, NotificationOut, QueueStats, WahaSession
from app.core.config import get_settings
from app.core.db import get_engine
from app.core.errors import AppError, NotFound, UpstreamError
from app.core.redis import Keys, get_redis
from app.core.runtime import google_config
from app.models import (
    AdminAudit,
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
    User,
)
from app.notify.ratelimit import tokens_left
from app.notify.waha import WahaClient, WahaError
from app.services import admin_auth
from app.services.events import wake_dispatcher
from app.workers.broker import TASK_GROUP, TASK_STREAM

router = APIRouter(prefix="/admin", tags=["admin"])
WAHA_WORDS = {"WORKING": "Connected", "SCAN_QR_CODE": "Waiting for QR scan", "STARTING": "Starting…",
              "STOPPED": "Stopped", "FAILED": "Failed – restart it", "UNKNOWN": "Unknown"}


async def _redis_value(key: str) -> str | None:
    raw = await get_redis().get(key)
    return None if raw is None else str(raw)


async def health_items() -> list[HealthItem]:
    """Every moving part, in plain words, for the overview and the status page."""
    redis = get_redis()
    items: list[HealthItem] = []
    try:
        async with get_engine().connect() as conn:
            await conn.execute(text("SELECT 1"))
        items.append(HealthItem(key="database", label="Database", ok=True, detail="Connected"))
    except Exception as exc:
        items.append(HealthItem(key="database", label="Database", ok=False, detail=type(exc).__name__))
    try:
        await redis.ping()
        items.append(HealthItem(key="redis", label="Queue & cache (Redis)", ok=True, detail="Connected"))
    except Exception as exc:
        items.append(HealthItem(key="redis", label="Queue & cache (Redis)", ok=False, detail=type(exc).__name__))
    waha = json.loads(await _redis_value(Keys.WAHA_HEALTH) or "{}")
    status = waha.get("status", "UNKNOWN")
    items.append(HealthItem(key="whatsapp", label="WhatsApp sender", ok=status == "WORKING",
                            detail=WAHA_WORDS.get(status, str(status).title())))
    worker = await redis.exists(Keys.WORKER_HEARTBEAT)
    items.append(HealthItem(key="worker", label="Mail checker (worker)", ok=bool(worker),
                            detail="Running" if worker else "Not running"))
    dispatcher = await redis.exists(Keys.DISPATCHER_LEADER)
    items.append(HealthItem(key="dispatcher", label="WhatsApp sender process", ok=bool(dispatcher),
                            detail="Running" if dispatcher else "Not running"))
    google = await google_config()
    if not google.oauth_ready:
        items.append(HealthItem(key="google", label="Gmail sign-in", ok=False, detail="Not configured"))
    else:
        items.append(HealthItem(key="google", label="Gmail sign-in", ok=True, detail="Configured"))
        if google.push_ready and google.push_mode == "pull":
            listener = await redis.exists(Keys.LISTENER_HEARTBEAT)
            items.append(HealthItem(key="listener", label="Gmail instant updates", ok=bool(listener),
                                    detail="Running" if listener else "Not running (Gmail is checked every 5 min)"))
    return items


@router.get("/overview", response_model=AdminOverview)
async def overview(_: AdminUser, db: DB) -> AdminOverview:
    now = datetime.now(UTC)
    day, week = now - timedelta(days=1), now - timedelta(days=7)
    clients, new_7d, active_7d = (await db.execute(select(
        func.count(), func.count().filter(User.created_at >= week),
        func.count().filter(User.last_login_at >= week)))).one()
    mailboxes = dict((await db.execute(select(Mailbox.status, func.count()).group_by(Mailbox.status))).all())
    rules = await db.scalar(select(func.count()).select_from(Rule)) or 0
    matched_24h = await db.scalar(select(func.count()).select_from(Message).where(Message.created_at >= day)) or 0
    sent_ok = [NotificationStatus.sent, NotificationStatus.delivered, NotificationStatus.read]
    sent_24h, failed_24h = (await db.execute(select(
        func.count().filter(Notification.status.in_(sent_ok)),
        func.count().filter(Notification.status.in_([NotificationStatus.failed, NotificationStatus.dead])),
    ).where(Notification.created_at >= day, Notification.kind == NotificationKind.alert))).one()
    emails_7d = await db.scalar(select(func.count()).select_from(OutboundEmail).where(
        OutboundEmail.status == OutboundStatus.sent, OutboundEmail.sent_at >= week)) or 0
    upcoming = await db.scalar(select(func.count()).select_from(Event).where(
        Event.status == EventStatus.upcoming, Event.starts_at >= now)) or 0
    outbox = dict((await db.execute(select(Notification.status, func.count()).group_by(Notification.status))).all())

    start = (now - timedelta(days=13)).date()

    def per_day(rows: Sequence[Any]) -> dict[str, int]:
        return {str(d): n for d, n in rows}

    matched = per_day((await db.execute(select(func.date(Message.created_at), func.count())
                                        .where(Message.created_at >= start).group_by(func.date(Message.created_at))
                                        )).all())
    sent = per_day((await db.execute(select(func.date(Notification.sent_at), func.count())
                                     .where(Notification.sent_at >= start).group_by(func.date(Notification.sent_at))
                                     )).all())
    signups = per_day((await db.execute(select(func.date(User.created_at), func.count())
                                        .where(User.created_at >= start).group_by(func.date(User.created_at)))).all())
    series = [DayCount(date=str(d), matched=matched.get(str(d), 0), sent=sent.get(str(d), 0),
                       new_clients=signups.get(str(d), 0))
              for d in (start + timedelta(days=i) for i in range(14))]
    health = await health_items()
    waha = json.loads(await _redis_value(Keys.WAHA_HEALTH) or "{}")
    return AdminOverview(
        clients=clients, active_clients_7d=active_7d, new_clients_7d=new_7d,
        mailboxes={str(k): v for k, v in mailboxes.items()}, rules=rules, matched_24h=matched_24h,
        alerts_sent_24h=sent_24h, alerts_failed_24h=failed_24h, emails_sent_7d=emails_7d,
        upcoming_events=upcoming, outbox={str(k): v for k, v in outbox.items()}, health=health,
        whatsapp_status=waha.get("status", "UNKNOWN"), google_ready=(await google_config()).oauth_ready,
        series=series,
    )


@router.get("/health", response_model=list[HealthItem])
async def health(_: AdminUser) -> list[HealthItem]:
    return await health_items()


# ---------------------------------------------------------------- WhatsApp


@router.get("/waha", response_model=WahaSession)
async def waha_session(_: AdminUser) -> WahaSession:
    client = WahaClient()
    try:
        info = await client.session_info()
    except WahaError as exc:
        return WahaSession(status="UNREACHABLE", detail=str(exc))
    status = info.get("status", "UNKNOWN")
    qr = None
    if status == "SCAN_QR_CODE":
        image = await client.qr_code()
        if image and image.get("data"):
            qr = f"data:{image['mimetype']};base64,{image['data']}"
    return WahaSession(status=status, me=(info.get("me") or {}).get("id"), dry_run=bool(info.get("dry_run")),
                       qr=qr)


@router.post("/waha/{action}", response_model=WahaSession)
async def waha_action(action: Literal["start", "restart", "logout", "stop"], admin: AdminUser, db: DB,
                      request: Request) -> WahaSession:
    """start/restart the session, stop it, or logout (unlink the phone; a new QR scan is needed)."""
    client = WahaClient()
    try:
        match action:
            case "start":
                await client.start_session()
            case "restart":
                await client.restart_session()
            case "stop":
                await client.stop_session()
            case "logout":
                await client.logout_session()
    except WahaError as exc:
        raise UpstreamError(str(exc)) from exc
    await admin_auth.record(db, admin, f"whatsapp.{action}", target_type="whatsapp", ip=client_ip(request))
    await db.commit()
    await get_redis().delete(Keys.WAHA_HEALTH)  # the dispatcher re-checks right away
    return await waha_session(admin)


# ---------------------------------------------------------------- queues & deliveries


@router.get("/queues", response_model=QueueStats)
async def queues(_: AdminUser, db: DB) -> QueueStats:
    redis = get_redis()
    settings = get_settings()
    outbox = dict((await db.execute(
        select(Notification.status, func.count()).group_by(Notification.status))).all())
    try:
        # Streams keep acked entries until trimmed, so XLEN is history; the group's lag is the real backlog.
        groups = await redis.xinfo_groups(TASK_STREAM)
        group = next((g for g in groups if g.get("name") == TASK_GROUP), {})
        backlog = int(group.get("lag") or 0)
        pending = int(group.get("pending") or 0)
    except ResponseError:
        backlog, pending = 0, 0
    dead = (await db.scalars(select(Notification).where(Notification.status == NotificationStatus.dead)
                             .order_by(Notification.updated_at.desc()).limit(20))).all()
    components = [ComponentHealth(name=h.key, ok=h.ok, detail=h.detail) for h in await health_items()]
    return QueueStats(
        outbox={str(k): v for k, v in outbox.items()}, task_backlog=backlog, task_pending=pending,
        global_tokens=await tokens_left(redis, Keys.RATE_GLOBAL, settings.rate_global_burst),
        components=components, dead_letters=[notification_out(n) for n in dead],
    )


@router.get("/notifications", response_model=list[NotificationOut])
async def notifications(
    _: AdminUser, db: DB, status: NotificationStatus | None = None, limit: int = Query(50, ge=1, le=200),
) -> list[NotificationOut]:
    stmt = select(Notification).order_by(Notification.created_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(Notification.status == status)
    return [notification_out(n) for n in (await db.scalars(stmt)).all()]


@router.post("/notifications/{notification_id}/retry", response_model=NotificationOut)
async def retry_notification(notification_id: str, admin: AdminUser, db: DB, request: Request) -> NotificationOut:
    n = await db.get(Notification, notification_id)
    if n is None:
        raise NotFound("Notification not found")
    if n.status not in (NotificationStatus.failed, NotificationStatus.dead, NotificationStatus.cancelled):
        raise AppError("Only failed, dead or cancelled notifications can be retried", code="not_retryable")
    n.status, n.attempts, n.next_attempt_at, n.last_error = NotificationStatus.queued, 0, datetime.now(UTC), None
    await admin_auth.record(db, admin, "notification.retry", target_type="notification", target_id=n.id,
                            ip=client_ip(request))
    await db.commit()
    await wake_dispatcher()
    return notification_out(n)


@router.get("/audit", response_model=list[AuditRow])
async def audit(_: AdminUser, db: DB, limit: int = Query(100, ge=1, le=500)) -> list[AdminAudit]:
    return list((await db.scalars(select(AdminAudit).order_by(AdminAudit.created_at.desc()).limit(limit))).all())
