from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session, session_factory
from app.core.errors import Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.models import Role, User

bearer = HTTPBearer(auto_error=False)

DB = Annotated[AsyncSession, Depends(get_session)]


async def current_user(
    db: DB, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> User:
    if credentials is None:
        raise Unauthorized("Sign in required")
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise Unauthorized("Session expired", code="token_expired")
    user = await db.get(User, UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise Unauthorized("Session expired", code="token_expired")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


async def stream_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> UUID:
    """Auth for long-lived streams: checks the user with a short session instead of holding one open."""
    if credentials is None:
        raise Unauthorized("Sign in required")
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise Unauthorized("Session expired", code="token_expired")
    async with session_factory()() as db:
        user = await db.get(User, UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise Unauthorized("Session expired", code="token_expired")
    return user.id


async def admin_user(user: CurrentUser) -> User:
    if user.role != Role.admin:
        raise Forbidden("Admins only")
    return user


AdminUser = Annotated[User, Depends(admin_user)]


def client_ip(request: Request) -> str | None:
    # uvicorn rewrites client from X-Forwarded-For only for trusted proxies (--forwarded-allow-ips).
    return request.client.host if request.client else None
