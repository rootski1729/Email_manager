from typing import Literal

from fastapi import APIRouter
from redis.exceptions import ResponseError
from sqlalchemy import func, select

from app.api.deps import DB, AdminUser
from app.api.routes.messages import notification_out
from app.api.schemas import ComponentHealth, QueueStats, WahaSession
from app.core.config import get_settings
from app.core.errors import UpstreamError
from app.core.redis import Keys, get_redis
from app.models import Notification, NotificationStatus
from app.notify.ratelimit import tokens_left
from app.notify.waha import WahaClient, WahaError
from app.workers.broker import TASK_GROUP, TASK_STREAM

router = APIRouter(prefix="/admin", tags=["admin"])


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
async def waha_action(action: Literal["start", "restart", "logout"], admin: AdminUser) -> WahaSession:
    client = WahaClient()
    try:
        match action:
            case "start":
                await client.start_session()
            case "restart":
                await client.restart_session()
            case "logout":
                await client.logout_session()
    except WahaError as exc:
        raise UpstreamError(str(exc)) from exc
    return await waha_session(admin)


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
    async def value(key: str) -> str | None:
        raw = await redis.get(key)
        return None if raw is None else str(raw)

    waha = await value(Keys.WAHA_HEALTH)
    components = [
        ComponentHealth(name="dispatcher", ok=bool(await redis.exists(Keys.DISPATCHER_LEADER)),
                        detail=await value(Keys.DISPATCHER_LEADER)),
        ComponentHealth(name="worker", ok=bool(await redis.exists(Keys.WORKER_HEARTBEAT)),
                        detail=await value(Keys.WORKER_HEARTBEAT)),
        ComponentHealth(name="gmail-listener", ok=bool(await redis.exists(Keys.LISTENER_HEARTBEAT))
                        or settings.gmail_push_mode == "push" or not settings.google_project_id,
                        detail=await value(Keys.LISTENER_HEARTBEAT) or settings.gmail_push_mode),
        ComponentHealth(name="whatsapp", ok=bool(waha and '"WORKING"' in waha), detail=waha),
    ]
    return QueueStats(
        outbox={str(k): v for k, v in outbox.items()}, task_backlog=backlog, task_pending=pending,
        global_tokens=await tokens_left(redis, Keys.RATE_GLOBAL, settings.rate_global_burst),
        components=components, dead_letters=[notification_out(n) for n in dead],
    )
