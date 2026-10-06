import json
import secrets
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select, update

from app.api.deps import DB, CurrentUser
from app.api.schemas import (
    DestinationCreate,
    DestinationOut,
    DestinationUpdate,
    DestinationVerify,
    GroupLinkOut,
)
from app.core.db import uuid7
from app.core.errors import AppError, Conflict, NotFound, TooManyRequests, UpstreamError
from app.core.redis import Keys, get_redis
from app.core.security import constant_time_equals, generate_otp, keyed_hash, normalize_phone
from app.models import Destination, DestinationKind
from app.notify.direct import send_now
from app.notify.waha import WahaClient, WahaError

router = APIRouter(prefix="/destinations", tags=["destinations"])
VERIFY_TTL_S = 600
GROUP_LINK_TTL_S = 900
MAX_DESTINATIONS = 10


def group_link_key(code: str) -> str:
    return f"grouplink:{code}"


async def _get(db: DB, user_id: UUID, destination_id: UUID) -> Destination:
    dest = await db.get(Destination, destination_id)
    if dest is None or dest.user_id != user_id:
        raise NotFound("Destination not found")
    return dest


@router.get("", response_model=list[DestinationOut])
async def list_destinations(user: CurrentUser, db: DB) -> list[Destination]:
    return list((await db.scalars(
        select(Destination).where(Destination.user_id == user.id).order_by(Destination.created_at)
    )).all())


async def _send_code(dest: Destination) -> None:
    code = generate_otp()
    redis = get_redis()
    key = Keys.dest_verify(dest.id)
    await redis.hset(key, mapping={"hash": keyed_hash(f"{dest.id}:{code}"), "attempts": 0})
    await redis.expire(key, VERIFY_TTL_S)
    try:
        await send_now(dest.chat_id, f"*MailSentinel* verification code: *{code}*\n\n"
                                     "Someone wants to send important-email alerts to this chat.")
    except WahaError as exc:
        raise UpstreamError("Could not send the verification code on WhatsApp") from exc


@router.post("", response_model=DestinationOut, status_code=201)
async def add_number(body: DestinationCreate, user: CurrentUser, db: DB) -> Destination:
    phone = normalize_phone(body.phone)
    if phone is None:
        raise AppError("Enter a valid phone number with country code", code="invalid_phone", status=422)
    count = len((await db.scalars(select(Destination.id).where(Destination.user_id == user.id))).all())
    if count >= MAX_DESTINATIONS:
        raise AppError(f"At most {MAX_DESTINATIONS} destinations", code="plan_limit", status=403)
    try:
        chat_id = await WahaClient().check_exists(phone)
    except WahaError as exc:
        raise UpstreamError("WhatsApp is not reachable right now") from exc
    if chat_id is None:
        raise AppError("That number is not on WhatsApp", code="not_on_whatsapp", status=422)
    if await db.scalar(select(Destination.id).where(Destination.user_id == user.id,
                                                    Destination.chat_id == chat_id)):
        raise Conflict("This number is already added")
    dest = Destination(id=uuid7(), user_id=user.id, kind=DestinationKind.whatsapp_number,
                       chat_id=chat_id, label=body.label)
    db.add(dest)
    await db.commit()
    await _send_code(dest)
    return dest


@router.post("/{destination_id}/resend", status_code=204)
async def resend_code(destination_id: UUID, user: CurrentUser, db: DB) -> None:
    dest = await _get(db, user.id, destination_id)
    if dest.verified_at:
        raise Conflict("Already verified")
    await _send_code(dest)


@router.post("/{destination_id}/verify", response_model=DestinationOut)
async def verify(destination_id: UUID, body: DestinationVerify, user: CurrentUser, db: DB) -> Destination:
    dest = await _get(db, user.id, destination_id)
    redis = get_redis()
    key = Keys.dest_verify(dest.id)
    stored = await redis.hgetall(key)
    if not stored:
        raise AppError("Code expired; request a new one", code="invalid_code")
    if await redis.hincrby(key, "attempts", 1) > 5:
        await redis.delete(key)
        raise TooManyRequests("Too many wrong codes; request a new one", retry_after=1)
    if not constant_time_equals(str(stored["hash"]), keyed_hash(f"{dest.id}:{body.code.strip()}")):
        raise AppError("Wrong code", code="invalid_code")
    await redis.delete(key)
    dest.verified_at = datetime.now(UTC)
    await db.commit()
    return dest


@router.patch("/{destination_id}", response_model=DestinationOut)
async def update_destination(
    destination_id: UUID, body: DestinationUpdate, user: CurrentUser, db: DB
) -> Destination:
    dest = await _get(db, user.id, destination_id)
    if body.label is not None:
        dest.label = body.label
    if body.is_default:
        if not dest.verified_at:
            raise AppError("Verify the destination first", code="not_verified")
        await db.execute(update(Destination).where(Destination.user_id == user.id).values(is_default=False))
        dest.is_default = True
    await db.commit()
    await db.refresh(dest)
    return dest


@router.delete("/{destination_id}", status_code=204)
async def delete_destination(destination_id: UUID, user: CurrentUser, db: DB) -> None:
    dest = await _get(db, user.id, destination_id)
    if dest.kind == DestinationKind.whatsapp_self:
        raise AppError("Your own number can't be removed", code="cannot_delete")
    was_default = dest.is_default
    await db.delete(dest)
    if was_default:
        await db.execute(update(Destination).where(Destination.user_id == user.id,
                                                   Destination.kind == DestinationKind.whatsapp_self)
                         .values(is_default=True))
    await db.commit()


@router.post("/group-link", response_model=GroupLinkOut)
async def start_group_link(user: CurrentUser) -> GroupLinkOut:
    """Link a WhatsApp group: add the MailSentinel number to the group and post this code there."""
    code = "MS-" + "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
    await get_redis().set(group_link_key(code), str(user.id), ex=GROUP_LINK_TTL_S)
    health = await get_redis().get(Keys.WAHA_HEALTH)
    me = json.loads(health).get("me") if health else None
    bot = f"+{me.split('@')[0]}" if me and "@" in me else None
    return GroupLinkOut(
        code=code, expires_in=GROUP_LINK_TTL_S, bot_number=bot,
        instructions=f"Add {bot or 'the MailSentinel WhatsApp number'} to your group, then send {code} in it.",
    )
