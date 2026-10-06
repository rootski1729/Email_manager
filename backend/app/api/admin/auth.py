"""Admin sign-in. Separate cookie, token type and accounts from the client app."""

from fastapi import APIRouter, Cookie, Request, Response
from sqlalchemy import select

from app.api.admin.schemas import AdminCreate, AdminLogin, AdminOut, AdminTokenOut, AdminUpdate, PasswordChange
from app.api.deps import DB, AdminUser, client_ip
from app.core.config import get_settings
from app.core.db import uuid7
from app.core.errors import AppError, Conflict, NotFound, Unauthorized
from app.models import AdminAccount
from app.services import admin_auth

router = APIRouter(prefix="/admin", tags=["admin"])
ADMIN_COOKIE = "ms_admin"
COOKIE_PATH = "/api/v1/admin/auth"


def _respond(response: Response, tokens: admin_auth.AdminTokens) -> AdminTokenOut:
    settings = get_settings()
    response.set_cookie(ADMIN_COOKIE, tokens.refresh_token, max_age=settings.admin_session_ttl_s, httponly=True,
                        secure=settings.cookie_secure, samesite="strict", path=COOKIE_PATH)
    return AdminTokenOut(access_token=tokens.access_token, expires_in=tokens.expires_in,
                         admin=AdminOut.model_validate(tokens.admin))


@router.post("/auth/login", response_model=AdminTokenOut)
async def login(body: AdminLogin, request: Request, response: Response, db: DB) -> AdminTokenOut:
    tokens = await admin_auth.login(db, body.username, body.password, ip=client_ip(request),
                                    user_agent=request.headers.get("user-agent"))
    return _respond(response, tokens)


@router.post("/auth/refresh", response_model=AdminTokenOut)
async def refresh(request: Request, response: Response, db: DB,
                  ms_admin: str | None = Cookie(default=None)) -> AdminTokenOut:
    if not ms_admin:
        raise Unauthorized("Admin sign-in required", code="session_expired")
    tokens = await admin_auth.rotate(db, ms_admin, ip=client_ip(request),
                                     user_agent=request.headers.get("user-agent"))
    return _respond(response, tokens)


@router.post("/auth/logout", status_code=204)
async def logout(response: Response, db: DB, ms_admin: str | None = Cookie(default=None)) -> None:
    if ms_admin:
        await admin_auth.logout(db, ms_admin)
    response.delete_cookie(ADMIN_COOKIE, path=COOKIE_PATH)


@router.get("/me", response_model=AdminOut)
async def me(admin: AdminUser) -> AdminAccount:
    return admin


@router.post("/me/password", status_code=204)
async def change_password(body: PasswordChange, admin: AdminUser, db: DB, request: Request) -> None:
    if not admin_auth.verify_password(admin.password_hash, body.current_password):
        raise AppError("The current password is wrong", code="wrong_password", status=422)
    admin.password_hash = admin_auth.hash_password(body.new_password)
    await admin_auth.record(db, admin, "admin.password_changed", ip=client_ip(request))
    await db.commit()


@router.get("/admins", response_model=list[AdminOut])
async def list_admins(_: AdminUser, db: DB) -> list[AdminAccount]:
    return list((await db.scalars(select(AdminAccount).order_by(AdminAccount.created_at))).all())


@router.post("/admins", response_model=AdminOut, status_code=201)
async def create_admin(body: AdminCreate, admin: AdminUser, db: DB, request: Request) -> AdminAccount:
    if await db.scalar(select(AdminAccount.id).where(AdminAccount.username == body.username)):
        raise Conflict("That username is taken")
    new = AdminAccount(id=uuid7(), username=body.username, display_name=body.display_name,
                       password_hash=admin_auth.hash_password(body.password))
    db.add(new)
    await admin_auth.record(db, admin, "admin.created", target_type="admin", target_id=new.id,
                            details={"username": body.username}, ip=client_ip(request))
    await db.commit()
    return new


@router.patch("/admins/{admin_id}", response_model=AdminOut)
async def update_admin(admin_id: str, body: AdminUpdate, admin: AdminUser, db: DB, request: Request
                       ) -> AdminAccount:
    target = await db.get(AdminAccount, admin_id)
    if target is None:
        raise NotFound("Admin not found")
    if body.is_active is False and target.id == admin.id:
        raise AppError("You can't disable your own account", code="self_disable", status=422)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(target, key, value)
    await admin_auth.record(db, admin, "admin.updated", target_type="admin", target_id=target.id,
                            details=body.model_dump(exclude_unset=True), ip=client_ip(request))
    await db.commit()
    return target
