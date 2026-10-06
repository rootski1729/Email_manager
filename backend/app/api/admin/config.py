"""Configure Gmail (Google Cloud OAuth client and Pub/Sub) from the admin console."""

from fastapi import APIRouter, Request
from sqlalchemy import delete, select

from app.api.admin.schemas import CheckResult, GoogleConfigIn, GoogleConfigOut
from app.api.deps import DB, AdminUser, client_ip
from app.core.config import get_settings
from app.core.http import get_http
from app.core.redis import Keys, get_redis
from app.core.runtime import GOOGLE_KEY, google_config, invalidate
from app.core.security import vault
from app.models import AppSetting
from app.services import admin_auth

router = APIRouter(prefix="/admin/config", tags=["admin"])


async def _out() -> GoogleConfigOut:
    g = await google_config()
    web = get_settings().public_web_url.rstrip("/")
    return GoogleConfigOut(
        client_id=g.client_id, client_secret_set=bool(g.client_secret), project_id=g.project_id,
        pubsub_topic=g.pubsub_topic, pubsub_subscription=g.pubsub_subscription, push_mode=g.push_mode,
        push_audience=g.push_audience, push_service_account=g.push_service_account, source=g.source,
        oauth_ready=g.oauth_ready, push_ready=g.push_ready, redirect_uri=g.redirect_uri, javascript_origin=web,
        listener_online=bool(await get_redis().exists(Keys.LISTENER_HEARTBEAT)),
    )


@router.get("/google", response_model=GoogleConfigOut)
async def get_google(_: AdminUser) -> GoogleConfigOut:
    return await _out()


@router.put("/google", response_model=GoogleConfigOut)
async def put_google(body: GoogleConfigIn, admin: AdminUser, db: DB, request: Request) -> GoogleConfigOut:
    row = await db.scalar(select(AppSetting).where(AppSetting.key == GOOGLE_KEY))
    if row is None:
        row = AppSetting(key=GOOGLE_KEY, value={})
        db.add(row)
    row.value = body.model_dump(exclude={"client_secret"})
    if body.client_secret:  # blank keeps the saved secret
        row.secret = vault().encrypt_json({"client_secret": body.client_secret.strip()})
    row.updated_by = admin.id
    await admin_auth.record(db, admin, "config.google_saved", target_type="config", target_id=GOOGLE_KEY,
                            details={"client_id": body.client_id, "project_id": body.project_id,
                                     "secret_changed": bool(body.client_secret)}, ip=client_ip(request))
    await db.commit()
    await invalidate()
    return await _out()


@router.delete("/google", response_model=GoogleConfigOut)
async def reset_google(admin: AdminUser, db: DB, request: Request) -> GoogleConfigOut:
    """Forget the saved values and fall back to the environment variables."""
    await db.execute(delete(AppSetting).where(AppSetting.key == GOOGLE_KEY))
    await admin_auth.record(db, admin, "config.google_reset", target_type="config", target_id=GOOGLE_KEY,
                            ip=client_ip(request))
    await db.commit()
    await invalidate()
    return await _out()


@router.post("/google/check", response_model=list[CheckResult])
async def check_google(_: AdminUser) -> list[CheckResult]:
    """Validate what can be checked without a user: format, and whether Google accepts the client."""
    g = await google_config()
    results: list[CheckResult] = []
    id_ok = g.client_id.endswith(".apps.googleusercontent.com")
    results.append(CheckResult(ok=id_ok, title="Client ID format",
                               detail="Looks right" if id_ok else "It should end with .apps.googleusercontent.com"))
    if g.oauth_ready:
        # A dummy code exchange: Google answers invalid_grant for a valid client and invalid_client otherwise.
        resp = await get_http().post("https://oauth2.googleapis.com/token", data={
            "code": "mailsentinel-check", "client_id": g.client_id, "client_secret": g.client_secret,
            "redirect_uri": g.redirect_uri, "grant_type": "authorization_code"})
        error = resp.json().get("error", "") if resp.headers.get("content-type", "").startswith("application/json") \
            else ""
        valid = error in ("invalid_grant", "redirect_uri_mismatch")
        results.append(CheckResult(ok=valid, title="Google accepts the client ID and secret",
                                   detail="Yes" if valid else f"Google said: {error or resp.status_code}"))
        if error == "redirect_uri_mismatch":
            results.append(CheckResult(ok=False, title="Redirect URI",
                                       detail=f"Add {g.redirect_uri} to the OAuth client's redirect URIs"))
    else:
        results.append(CheckResult(ok=False, title="Client ID and secret", detail="Fill in both to enable Gmail"))
    if g.push_ready:
        listener = bool(await get_redis().exists(Keys.LISTENER_HEARTBEAT))
        results.append(CheckResult(
            ok=g.push_mode == "push" or listener, title="Instant Gmail updates",
            detail=("Push mode: Google calls the API directly" if g.push_mode == "push" else
                    "The listener is running" if listener else
                    "The gmail-listener container isn't running; start it with the 'gmail' compose profile")))
    else:
        results.append(CheckResult(ok=True, title="Instant Gmail updates",
                                   detail="Not set up: Gmail mailboxes are checked every 5 minutes instead"))
    return results
