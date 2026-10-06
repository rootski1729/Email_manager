"""Inbound webhooks: Gmail push (Pub/Sub, OIDC-authenticated) and WAHA events (HMAC-authenticated)."""

import asyncio
import base64
import hashlib
import hmac
import json
import re
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request, Response
from sqlalchemy import select, update

from app.api.deps import DB
from app.api.routes.destinations import group_link_key
from app.core.config import get_settings
from app.core.db import uuid7
from app.core.errors import Forbidden, Unauthorized
from app.core.logging import log
from app.core.redis import Keys, get_redis
from app.models import Destination, DestinationKind, Notification, NotificationStatus, Role, User
from app.notify.direct import send_now
from app.notify.waha import WahaError
from app.services import events
from app.services.gmail_intake import handle_gmail_notification
from app.workers.tasks import handle_whatsapp_message

router = APIRouter(prefix="/webhooks", tags=["webhooks"], include_in_schema=False)
GROUP_CODE = re.compile(r"\bMS-[A-Z2-9]{6}\b")
ACK_STATUS = {2: NotificationStatus.delivered, 3: NotificationStatus.read, 4: NotificationStatus.read}


def _verify_pubsub_jwt(token: str) -> dict[str, Any]:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    settings = get_settings()
    claims = id_token.verify_oauth2_token(token, google_requests.Request(), audience=settings.gmail_push_audience)
    if settings.gmail_push_service_account and claims.get("email") != settings.gmail_push_service_account:
        raise ValueError("unexpected service account")
    if not claims.get("email_verified"):
        raise ValueError("email not verified")
    return dict(claims)


@router.post("/gmail")
async def gmail_push(request: Request) -> Response:
    settings = get_settings()
    if settings.gmail_push_mode != "push":
        raise Forbidden("Push mode is disabled")
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise Unauthorized("Missing Pub/Sub token")
    try:
        await asyncio.to_thread(_verify_pubsub_jwt, auth.removeprefix("Bearer "))
    except ValueError as exc:
        log.warning("gmail_push_rejected", error=str(exc))
        raise Unauthorized("Invalid Pub/Sub token") from exc
    body = await request.json()
    data = json.loads(base64.b64decode(body.get("message", {}).get("data", "") or b"e30="))
    if address := data.get("emailAddress"):
        await handle_gmail_notification(address)
    return Response(status_code=204)  # any 2xx acks the Pub/Sub message


def _check_hmac(raw: bytes, request: Request) -> None:
    key = get_settings().waha_webhook_hmac_key.get_secret_value()
    if not key:
        return
    signature = request.headers.get("x-webhook-hmac", "")
    expected = hmac.new(key.encode(), raw, hashlib.sha512).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise Unauthorized("Bad webhook signature")


@router.post("/waha")
async def waha_event(request: Request, db: DB) -> Response:
    raw = await request.body()
    _check_hmac(raw, request)
    event = json.loads(raw or b"{}")
    kind, payload = event.get("event"), event.get("payload") or {}
    if kind == "message.ack":
        await _on_ack(db, payload)
    elif kind == "session.status":
        await _on_session_status(db, payload)
    elif kind in ("message", "message.any"):
        if str(payload.get("from") or "").endswith("@g.us"):
            await _on_message(db, payload)
        else:
            # Commands are handled off the request path; the task dedupes message.any vs message.
            fields = ("id", "from", "to", "fromMe", "body", "hasMedia", "media", "timestamp")
            await handle_whatsapp_message.kiq({k: payload.get(k) for k in fields})
    return Response(status_code=204)


async def _on_ack(db: DB, payload: dict[str, Any]) -> None:
    status = ACK_STATUS.get(int(payload.get("ack") or 0))
    message_id = payload.get("id")
    if not status or not message_id:
        return
    rows = (await db.execute(
        update(Notification)
        .where(Notification.provider_message_id == message_id,
               Notification.status.in_([NotificationStatus.sent, NotificationStatus.delivered]))
        .values(status=status).returning(Notification.id, Notification.user_id)
    )).all()
    await db.commit()
    for notification_id, user_id in rows:
        await events.publish(user_id, "notification.updated", {"id": str(notification_id), "status": status})


async def _on_session_status(db: DB, payload: dict[str, Any]) -> None:
    status = payload.get("status", "UNKNOWN")
    redis = get_redis()
    current = json.loads(await redis.get(Keys.WAHA_HEALTH) or "{}")
    current.update(status=status, checked_at=datetime.now(UTC).isoformat())
    await redis.set(Keys.WAHA_HEALTH, json.dumps(current), ex=120)
    admins = (await db.scalars(select(User.id).where(User.role == Role.admin))).all()
    for admin_id in admins:
        await events.publish(admin_id, "system", {"waha_status": status})
    log.info("waha_session_status", status=status)


async def _on_message(db: DB, payload: dict[str, Any]) -> None:
    """Link a WhatsApp group when someone posts a pending MS-XXXXXX code in it."""
    chat_id = payload.get("from") or ""
    if not chat_id.endswith("@g.us") or payload.get("fromMe"):
        return
    match = GROUP_CODE.search(payload.get("body") or "")
    if not match:
        return
    user_id = await get_redis().getdel(group_link_key(match.group(0)))
    if not user_id:
        return
    uid = UUID(str(user_id))
    destination_id = await db.scalar(select(Destination.id).where(Destination.user_id == uid,
                                                                  Destination.chat_id == chat_id))
    if not destination_id:
        destination_id = uuid7()
        db.add(Destination(id=destination_id, user_id=uid, kind=DestinationKind.whatsapp_group, chat_id=chat_id,
                           label="WhatsApp group", verified_at=datetime.now(UTC)))
        await db.commit()
    await events.publish(uid, "destination.linked", {"id": str(destination_id), "chat_id": chat_id})
    try:
        await send_now(chat_id, "✅ This group will now receive MailSentinel alerts.")
    except WahaError:
        log.warning("group_link_confirm_failed")
