from datetime import UTC, datetime

from fastapi import APIRouter
from sqlalchemy import update

from app.api.deps import DB, CurrentUser
from app.api.schemas import DigestSettings, QuietHours, SettingsOut, SettingsUpdate, UserOut, UserUpdate
from app.core.config import PLANS
from app.models import RefreshToken, UserSettings

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=UserOut)
async def get_me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("", response_model=UserOut)
async def update_me(body: UserUpdate, user: CurrentUser, db: DB) -> UserOut:
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    await db.commit()
    return UserOut.model_validate(user)


async def _settings(db: DB, user: CurrentUser) -> UserSettings:
    pref = await db.get(UserSettings, user.id)
    if pref is None:
        pref = UserSettings(user_id=user.id, quiet_hours={}, digest={})
        db.add(pref)
        await db.flush()
    return pref


def _out(pref: UserSettings, plan: str) -> SettingsOut:
    return SettingsOut(
        quiet_hours=QuietHours.model_validate(pref.quiet_hours or {}),
        digest=DigestSettings.model_validate(pref.digest or {}),
        daily_cap=pref.daily_cap,
        compose_enabled=pref.compose_enabled if pref.compose_enabled is not None else True,
        plan_limits=PLANS.get(plan, PLANS["free"]).model_dump(),
    )


@router.get("/settings", response_model=SettingsOut)
async def get_settings_(user: CurrentUser, db: DB) -> SettingsOut:
    pref = await _settings(db, user)
    await db.commit()
    return _out(pref, user.plan)


@router.put("/settings", response_model=SettingsOut)
async def put_settings(body: SettingsUpdate, user: CurrentUser, db: DB) -> SettingsOut:
    pref = await _settings(db, user)
    data = body.model_dump(exclude_unset=True)
    if "quiet_hours" in data:
        pref.quiet_hours = data["quiet_hours"]
    if "digest" in data:
        pref.digest = data["digest"]
    if "daily_cap" in data:
        pref.daily_cap = data["daily_cap"]
    if data.get("compose_enabled") is not None:
        pref.compose_enabled = data["compose_enabled"]
    await db.commit()
    return _out(pref, user.plan)


@router.post("/sessions/revoke-all", status_code=204)
async def revoke_all_sessions(user: CurrentUser, db: DB) -> None:
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id,
                                                RefreshToken.revoked_at.is_(None))
                     .values(revoked_at=datetime.now(UTC)))
    await db.commit()
