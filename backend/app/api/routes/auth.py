from typing import Annotated

from fastapi import APIRouter, Cookie, Request, Response

from app.api.deps import DB, client_ip
from app.api.schemas import OtpRequest, OtpRequested, OtpVerify, TokenOut
from app.core.config import get_settings
from app.core.errors import Unauthorized
from app.services import auth

router = APIRouter(prefix="/auth", tags=["auth"])
REFRESH_COOKIE = "ms_refresh"
COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        REFRESH_COOKIE, token, max_age=settings.refresh_token_ttl_s, httponly=True,
        secure=settings.cookie_secure, samesite="lax", path=COOKIE_PATH,
    )


@router.post("/otp/request", response_model=OtpRequested)
async def request_otp(body: OtpRequest, request: Request) -> OtpRequested:
    phone = await auth.request_code(body.phone, ip=client_ip(request), turnstile_token=body.turnstile_token)
    return OtpRequested(phone=phone, expires_in=get_settings().otp_ttl_s)


@router.post("/otp/verify", response_model=TokenOut)
async def verify_otp(body: OtpVerify, request: Request, response: Response, db: DB) -> TokenOut:
    issued = await auth.verify_code(
        db, body.phone, body.code, user_agent=request.headers.get("user-agent"), ip=client_ip(request)
    )
    _set_refresh_cookie(response, issued.refresh_token)
    return TokenOut(access_token=issued.access_token, expires_in=issued.expires_in)


@router.post("/refresh", response_model=TokenOut)
async def refresh(
    request: Request, response: Response, db: DB,
    ms_refresh: Annotated[str | None, Cookie()] = None,
) -> TokenOut:
    if not ms_refresh:
        raise Unauthorized("Sign in required", code="session_expired")
    issued = await auth.rotate(db, ms_refresh, user_agent=request.headers.get("user-agent"),
                               ip=client_ip(request))
    _set_refresh_cookie(response, issued.refresh_token)
    return TokenOut(access_token=issued.access_token, expires_in=issued.expires_in)


@router.post("/logout", status_code=204)
async def logout(response: Response, db: DB, ms_refresh: Annotated[str | None, Cookie()] = None) -> None:
    if ms_refresh:
        await auth.revoke(db, ms_refresh)
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
