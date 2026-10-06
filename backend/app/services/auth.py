"""WhatsApp OTP sign-in and rotating refresh tokens."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import uuid7
from app.core.errors import AppError, TooManyRequests, Unauthorized, UpstreamError
from app.core.http import get_http
from app.core.logging import log
from app.core.redis import Keys, get_redis
from app.core.security import (
    constant_time_equals,
    create_access_token,
    generate_otp,
    keyed_hash,
    new_opaque_token,
    normalize_phone,
    phone_to_chat_id,
    sha256,
)
from app.models import Destination, DestinationKind, RefreshToken, Role, User, UserSettings
from app.notify.direct import send_now
from app.notify.waha import WahaError

TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
IP_REQUESTS_PER_WINDOW = 20


@dataclass
class IssuedTokens:
    access_token: str
    refresh_token: str
    expires_in: int
    user: User


async def verify_turnstile(token: str | None, ip: str | None) -> None:
    secret = get_settings().turnstile_secret
    if secret is None or not secret.get_secret_value():
        return
    if not token:
        raise AppError("Please complete the CAPTCHA", code="captcha_required")
    resp = await get_http().post(TURNSTILE_URL, data={
        "secret": secret.get_secret_value(), "response": token, **({"remoteip": ip} if ip else {}),
    })
    if resp.status_code != 200 or not resp.json().get("success"):
        raise AppError("CAPTCHA verification failed", code="captcha_failed")


async def _throttle(key: str, limit: int, window_s: int) -> None:
    redis = get_redis()
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, window_s)
    if count > limit:
        ttl = await redis.ttl(key)
        raise TooManyRequests("Too many code requests. Try again later.", retry_after=max(ttl, 1))


async def request_code(phone_raw: str, *, ip: str | None, turnstile_token: str | None) -> str:
    settings = get_settings()
    phone = normalize_phone(phone_raw)
    if phone is None:
        raise AppError("Enter a valid phone number with country code, e.g. +919876543210",
                       code="invalid_phone", status=422)
    await verify_turnstile(turnstile_token, ip)
    if ip:
        await _throttle(Keys.ip_requests(ip), IP_REQUESTS_PER_WINDOW, settings.otp_request_window_s)
    await _throttle(Keys.otp_requests(phone), settings.otp_requests_per_window, settings.otp_request_window_s)

    code = generate_otp()
    redis = get_redis()
    key = Keys.otp(phone)
    await redis.delete(key)
    await redis.hset(key, mapping={"hash": keyed_hash(f"{phone}:{code}"), "attempts": 0})
    await redis.expire(key, settings.otp_ttl_s)

    text = (f"*MailSentinel* sign-in code: *{code}*\n\nIt expires in {settings.otp_ttl_s // 60} minutes. "
            "If you didn't ask for it, ignore this message.")
    try:
        await send_now(phone_to_chat_id(phone), text)
    except WahaError as exc:
        if settings.environment != "production" or phone in settings.admin_phones:
            # Bootstrap path: the operator signs in before WhatsApp is paired, reading the server log.
            log.warning("otp_delivery_failed_logged_for_operator", phone=phone, code=code, error=str(exc))
        else:
            await redis.delete(key)
            raise UpstreamError("Could not send the code on WhatsApp right now") from exc
    if settings.waha_dry_run:
        log.warning("otp_dry_run", code=code)
    return phone


async def verify_code(
    db: AsyncSession, phone_raw: str, code: str, *, user_agent: str | None, ip: str | None
) -> IssuedTokens:
    settings = get_settings()
    phone = normalize_phone(phone_raw)
    if phone is None:
        raise Unauthorized("Invalid or expired code", code="invalid_code")
    redis = get_redis()
    key = Keys.otp(phone)
    stored = await redis.hgetall(key)
    if not stored:
        raise Unauthorized("Invalid or expired code", code="invalid_code")
    attempts = await redis.hincrby(key, "attempts", 1)
    if attempts > settings.otp_max_attempts:
        await redis.delete(key)
        raise TooManyRequests("Too many wrong codes. Request a new one.", retry_after=1)
    if not constant_time_equals(str(stored["hash"]), keyed_hash(f"{phone}:{code.strip()}")):
        raise Unauthorized("Invalid or expired code", code="invalid_code")
    await redis.delete(key)

    user = await db.scalar(select(User).where(User.phone_e164 == phone))
    if user is None:
        user = User(id=uuid7(), phone_e164=phone)
        db.add(user)
        await db.flush()
        db.add(UserSettings(user_id=user.id, quiet_hours={"enabled": False, "start": "23:00", "end": "07:00"},
                            digest={"enabled": False, "time": "08:00"}))
        db.add(Destination(id=uuid7(), user_id=user.id, kind=DestinationKind.whatsapp_self,
                           chat_id=phone_to_chat_id(phone), label="My WhatsApp",
                           verified_at=datetime.now(UTC), is_default=True))
        log.info("user_created", user_id=str(user.id))
    if not user.is_active:
        raise Unauthorized("This account is disabled", code="account_disabled")
    user.role = Role.admin if phone in settings.admin_phones else Role.user
    user.last_login_at = datetime.now(UTC)
    tokens = await _issue(db, user, family_id=uuid7(), user_agent=user_agent, ip=ip)
    await db.commit()
    return tokens


async def _issue(
    db: AsyncSession, user: User, *, family_id: UUID, user_agent: str | None, ip: str | None
) -> IssuedTokens:
    settings = get_settings()
    raw = new_opaque_token()
    db.add(RefreshToken(
        id=uuid7(), user_id=user.id, family_id=family_id, token_hash=sha256(raw),
        expires_at=datetime.now(UTC) + timedelta(seconds=settings.refresh_token_ttl_s),
        user_agent=(user_agent or "")[:300] or None, ip=ip,
    ))
    return IssuedTokens(
        access_token=create_access_token(user.id, user.role.value), refresh_token=raw,
        expires_in=settings.access_token_ttl_s, user=user,
    )


async def rotate(db: AsyncSession, raw: str, *, user_agent: str | None, ip: str | None) -> IssuedTokens:
    token = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == sha256(raw)).with_for_update())
    now = datetime.now(UTC)
    if token is None:
        raise Unauthorized("Session expired, sign in again", code="session_expired")
    if token.revoked_at is not None:
        # A rotated token was used again: assume theft and end every session in this family.
        await db.execute(update(RefreshToken).where(RefreshToken.family_id == token.family_id,
                                                    RefreshToken.revoked_at.is_(None)).values(revoked_at=now))
        await db.commit()
        log.warning("refresh_token_reuse", user_id=str(token.user_id))
        raise Unauthorized("Session expired, sign in again", code="session_expired")
    if token.expires_at < now:
        raise Unauthorized("Session expired, sign in again", code="session_expired")
    user = await db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise Unauthorized("Session expired, sign in again", code="session_expired")
    issued = await _issue(db, user, family_id=token.family_id, user_agent=user_agent, ip=ip)
    await db.flush()
    token.revoked_at = now
    token.replaced_by = (await db.scalar(
        select(RefreshToken.id).where(RefreshToken.token_hash == sha256(issued.refresh_token))))
    await db.commit()
    return issued


async def revoke(db: AsyncSession, raw: str) -> None:
    await db.execute(update(RefreshToken).where(RefreshToken.token_hash == sha256(raw),
                                                RefreshToken.revoked_at.is_(None))
                     .values(revoked_at=datetime.now(UTC)))
    await db.commit()
