"""Admin console sign-in: username + password (Argon2), lockout, rotating sessions, audit log."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import session_factory, uuid7
from app.core.errors import TooManyRequests, Unauthorized
from app.core.logging import log
from app.core.redis import get_redis
from app.core.security import create_admin_token, new_opaque_token, sha256
from app.models import AdminAccount, AdminAudit, AdminSession

hasher = PasswordHasher()
MAX_FAILED = 5
LOCK_FOR = timedelta(minutes=15)
IP_ATTEMPTS_PER_10_MIN = 30
MIN_PASSWORD = 10
# Verified against when the username doesn't exist, so timing doesn't reveal valid usernames.
_DUMMY_HASH = hasher.hash("not-a-real-password-for-timing")


@dataclass
class AdminTokens:
    access_token: str
    refresh_token: str
    expires_in: int
    admin: AdminAccount


def hash_password(password: str) -> str:
    if len(password) < MIN_PASSWORD:
        raise ValueError(f"Use at least {MIN_PASSWORD} characters")
    return hasher.hash(password)


def verify_password(stored: str, password: str) -> bool:
    try:
        return hasher.verify(stored, password)
    except (VerificationError, InvalidHashError):
        return False


async def ensure_bootstrap_admin() -> None:
    """Create the first admin from ADMIN_USERNAME / ADMIN_PASSWORD if there is none yet."""
    settings = get_settings()
    username = settings.admin_username.strip().lower()
    password = settings.admin_password.get_secret_value()
    if not username or not password:
        return
    async with session_factory()() as db:
        if await db.scalar(select(func.count()).select_from(AdminAccount)):
            return
        db.add(AdminAccount(id=uuid7(), username=username, display_name="Administrator",
                            password_hash=hash_password(password)))
        await db.commit()
    log.info("bootstrap_admin_created", username=username)


async def _ip_throttle(ip: str | None) -> None:
    if not ip:
        return
    redis = get_redis()
    key = f"rl:adminlogin:{ip}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 600)
    if count > IP_ATTEMPTS_PER_10_MIN:
        raise TooManyRequests("Too many sign-in attempts. Try again later.", retry_after=max(await redis.ttl(key), 1))


async def login(db: AsyncSession, username: str, password: str, *, ip: str | None, user_agent: str | None
                ) -> AdminTokens:
    await _ip_throttle(ip)
    admin = await db.scalar(select(AdminAccount).where(AdminAccount.username == username.strip().lower())
                            .with_for_update())
    now = datetime.now(UTC)
    if admin is None:
        verify_password(_DUMMY_HASH, password)
        raise Unauthorized("Wrong username or password", code="invalid_credentials")
    if admin.locked_until and admin.locked_until > now:
        minutes = int((admin.locked_until - now).total_seconds() // 60) + 1
        raise TooManyRequests(f"Too many wrong passwords. Try again in {minutes} min.", retry_after=minutes * 60)
    if not admin.is_active or not verify_password(admin.password_hash, password):
        admin.failed_logins += 1
        if admin.failed_logins >= MAX_FAILED:
            admin.locked_until = now + LOCK_FOR
            admin.failed_logins = 0
        await db.commit()
        raise Unauthorized("Wrong username or password", code="invalid_credentials")
    if hasher.check_needs_rehash(admin.password_hash):
        admin.password_hash = hasher.hash(password)
    admin.failed_logins = 0
    admin.locked_until = None
    admin.last_login_at = now
    tokens = _issue(db, admin, ip=ip, user_agent=user_agent)
    await record(db, admin, "admin.login", ip=ip)
    await db.commit()
    return tokens


def _issue(db: AsyncSession, admin: AdminAccount, *, ip: str | None, user_agent: str | None) -> AdminTokens:
    settings = get_settings()
    raw = new_opaque_token()
    db.add(AdminSession(id=uuid7(), admin_id=admin.id, token_hash=sha256(raw), ip=ip,
                        user_agent=(user_agent or "")[:300] or None,
                        expires_at=datetime.now(UTC) + timedelta(seconds=settings.admin_session_ttl_s)))
    return AdminTokens(create_admin_token(admin.id), raw, settings.admin_access_ttl_s, admin)


async def rotate(db: AsyncSession, raw: str, *, ip: str | None, user_agent: str | None) -> AdminTokens:
    session = await db.scalar(select(AdminSession).where(AdminSession.token_hash == sha256(raw)).with_for_update())
    now = datetime.now(UTC)
    if session is None or session.revoked_at is not None or session.expires_at < now:
        if session is not None and session.revoked_at is not None:
            # Reuse of a rotated token: end every session of this admin.
            await db.execute(update(AdminSession).where(AdminSession.admin_id == session.admin_id,
                                                        AdminSession.revoked_at.is_(None)).values(revoked_at=now))
            await db.commit()
        raise Unauthorized("Admin session expired", code="session_expired")
    admin = await db.get(AdminAccount, session.admin_id)
    if admin is None or not admin.is_active:
        raise Unauthorized("Admin session expired", code="session_expired")
    session.revoked_at = now
    tokens = _issue(db, admin, ip=ip, user_agent=user_agent)
    await db.commit()
    return tokens


async def logout(db: AsyncSession, raw: str) -> None:
    await db.execute(update(AdminSession).where(AdminSession.token_hash == sha256(raw),
                                                AdminSession.revoked_at.is_(None))
                     .values(revoked_at=datetime.now(UTC)))
    await db.commit()


async def record(
    db: AsyncSession, admin: AdminAccount, action: str, *, target_type: str | None = None,
    target_id: Any = None, details: dict[str, Any] | None = None, ip: str | None = None,
) -> None:
    """Add an audit entry inside the caller's transaction."""
    db.add(AdminAudit(id=uuid7(), admin_id=admin.id, admin_username=admin.username, action=action,
                      target_type=target_type, target_id=str(target_id) if target_id is not None else None,
                      details=details or {}, ip=ip))
