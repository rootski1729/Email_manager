import json
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from sqlalchemy import func, select, update

from app.api.deps import DB, CurrentUser
from app.api.schemas import (
    DigestSettings,
    OnboardingOut,
    OnboardingStep,
    QuietHours,
    SettingsOut,
    SettingsUpdate,
    TestAlertOut,
    UserOut,
    UserUpdate,
)
from app.core.config import PLANS
from app.core.db import uuid7
from app.core.errors import AppError, TooManyRequests
from app.core.redis import Keys, get_redis
from app.models import (
    EmailTemplate,
    Mailbox,
    Message,
    NotificationKind,
    RefreshToken,
    Rule,
    UserSettings,
)
from app.notify.templates import render_alert
from app.services import outbox
from app.services.events import wake_dispatcher
from app.services.schedule import tz

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
        muted_senders=list(pref.muted_senders or []),
        weekly_recap=pref.weekly_recap if pref.weekly_recap is not None else True,
        deadlines_enabled=pref.deadlines_enabled if pref.deadlines_enabled is not None else True,
        ai_enabled=pref.ai_enabled if pref.ai_enabled is not None else True,
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
    for key in ("compose_enabled", "muted_senders", "weekly_recap", "deadlines_enabled", "ai_enabled"):
        if data.get(key) is not None:
            setattr(pref, key, data[key])
    await db.commit()
    return _out(pref, user.plan)


@router.post("/sessions/revoke-all", status_code=204)
async def revoke_all_sessions(user: CurrentUser, db: DB) -> None:
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id,
                                                RefreshToken.revoked_at.is_(None))
                     .values(revoked_at=datetime.now(UTC)))
    await db.commit()


TEST_ALERTS_PER_HOUR = 3


@router.get("/onboarding", response_model=OnboardingOut)
async def onboarding(user: CurrentUser, db: DB) -> OnboardingOut:
    """The getting-started checklist shown on the dashboard until everything is set up."""
    pref = await _settings(db, user)
    mailboxes = await db.scalar(select(func.count()).select_from(Mailbox).where(Mailbox.user_id == user.id)) or 0
    rules = await db.scalar(select(func.count()).select_from(Rule).where(Rule.user_id == user.id)) or 0
    matched = await db.scalar(select(func.count()).select_from(Message).where(Message.user_id == user.id)) or 0
    templates = await db.scalar(select(func.count()).select_from(EmailTemplate)
                                .where(EmailTemplate.user_id == user.id)) or 0
    raw = await get_redis().get(Keys.WAHA_HEALTH)
    whatsapp_ok = bool(raw) and json.loads(raw).get("status") == "WORKING"
    steps = [
        OnboardingStep(id="mailbox", title="Connect a mailbox", href="/mailboxes", done=mailboxes > 0,
                       description="Gmail with one click, or any other mailbox over IMAP."),
        OnboardingStep(id="whatsapp", title="WhatsApp alerts are online", href="/destinations", done=whatsapp_ok,
                       description="The number that sends your alerts is connected. If not, your administrator "
                                   "reconnects it."),
        OnboardingStep(id="rule", title="Choose what matters", href="/rules", done=rules > 0,
                       description="Start from a pack (exams, jobs, bank...) or build your own rule."),
        OnboardingStep(id="test", title="Send yourself a test alert", href="/dashboard",
                       done=pref.test_alert_at is not None,
                       description="See exactly what an alert looks like on your phone."),
        OnboardingStep(id="match", title="Catch your first important email", href="/messages", done=matched > 0,
                       description="It happens automatically as new mail arrives."),
        OnboardingStep(id="template", title="Try sending email from WhatsApp", href="/templates",
                       done=templates > 0, description="Save a template, then send /email on WhatsApp."),
    ]
    await db.commit()
    return OnboardingOut(steps=steps, completed=sum(s.done for s in steps), total=len(steps),
                         dismissed=bool(pref.onboarding_dismissed))


@router.post("/onboarding/dismiss", status_code=204)
async def dismiss_onboarding(user: CurrentUser, db: DB) -> None:
    pref = await _settings(db, user)
    pref.onboarding_dismissed = True
    await db.commit()


@router.post("/test-alert", response_model=TestAlertOut, status_code=202)
async def send_test_alert(user: CurrentUser, db: DB) -> TestAlertOut:
    """Queue a sample alert to your default WhatsApp destination, formatted exactly like a real one."""
    destination = await outbox.default_destination(db, user.id)
    if destination is None:
        raise AppError("Add a verified WhatsApp destination first", code="no_destination", status=422)
    redis = get_redis()
    key = Keys.test_alerts(user.id)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 3600)
    if count > TEST_ALERTS_PER_HOUR:
        raise TooManyRequests("You can send 3 test alerts per hour", retry_after=max(await redis.ttl(key), 1))
    zone = tz(user.timezone)
    exam = (datetime.now(UTC) + timedelta(days=6)).astimezone(zone).replace(hour=10, minute=0, second=0)
    sample = {
        "message_id": None, "ref": "TEST", "mailbox_address": "you@example.com", "from_name": "Examination Cell",
        "from_address": "exams@univ.edu", "subject": "Admit card released for end-semester examinations",
        "snippet": "Your admit card is now available on the student portal. The first paper is on "
                   f"{exam.strftime('%d %b')} at 10:00 AM.",
        "rules": ["Exams & results"], "web_url": None, "timezone": user.timezone,
        "events": [{"kind": "exam", "title": "Exam", "starts_at": exam.isoformat(), "all_day": False,
                    "reminders": True}],
    }
    text = "🧪 *This is a test alert* – real ones look exactly like this:\n\n" + render_alert(sample)
    await outbox.enqueue(db, user_id=user.id, destination=destination, kind=NotificationKind.system,
                         payload={"text": text}, dedupe=f"test-alert:{user.id}:{uuid7()}")
    pref = await _settings(db, user)
    pref.test_alert_at = datetime.now(UTC)
    await db.commit()
    await wake_dispatcher()
    return TestAlertOut(queued=True, chat_id=destination.chat_id)
