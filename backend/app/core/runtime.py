"""Settings an admin can change without a redeploy (stored in `app_settings`, env vars as the fallback).

Each process keeps a copy and re-reads it when the Redis version counter changes, so an edit in the admin
console reaches the API, workers and listener within a few seconds.
"""

import time
from dataclasses import dataclass, replace
from typing import Any, Literal

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import session_factory
from app.core.redis import get_redis
from app.core.security import vault

GOOGLE_KEY = "google"
VERSION_KEY = "cfg:ver"
CHECK_EVERY_S = 5.0


@dataclass(frozen=True, slots=True)
class GoogleConfig:
    client_id: str
    client_secret: str
    project_id: str
    pubsub_topic: str
    pubsub_subscription: str
    push_mode: Literal["pull", "push"]
    push_audience: str
    push_service_account: str
    source: Literal["database", "environment"]

    @property
    def oauth_ready(self) -> bool:
        return bool(self.client_id and self.client_secret)

    @property
    def push_ready(self) -> bool:
        return bool(self.project_id and self.pubsub_topic)

    @property
    def redirect_uri(self) -> str:
        return get_settings().google_oauth_redirect_uri


def _from_env() -> GoogleConfig:
    s = get_settings()
    return GoogleConfig(
        client_id=s.google_client_id, client_secret=s.google_client_secret.get_secret_value(),
        project_id=s.google_project_id, pubsub_topic=s.google_pubsub_topic,
        pubsub_subscription=s.google_pubsub_subscription, push_mode=s.gmail_push_mode,
        push_audience=s.gmail_push_audience, push_service_account=s.gmail_push_service_account, source="environment",
    )


_cache: tuple[str, float, GoogleConfig] | None = None


async def google_config() -> GoogleConfig:
    global _cache
    now = time.monotonic()
    if _cache and now - _cache[1] < CHECK_EVERY_S:
        return _cache[2]
    version = str(await get_redis().get(VERSION_KEY) or "0")
    if _cache and _cache[0] == version:
        _cache = (version, now, _cache[2])
        return _cache[2]
    config = await _load()
    _cache = (version, now, config)
    return config


async def _load() -> GoogleConfig:
    from app.models import AppSetting  # models import core; keep this module importable on its own

    base = _from_env()
    async with session_factory()() as db:
        row = await db.scalar(select(AppSetting).where(AppSetting.key == GOOGLE_KEY))
    if row is None:
        return base
    value: dict[str, Any] = row.value or {}
    secret = vault().decrypt_json(row.secret).get("client_secret", "") if row.secret else ""
    return replace(
        base,
        client_id=value.get("client_id") or base.client_id,
        client_secret=secret or base.client_secret,
        project_id=value.get("project_id", base.project_id),
        pubsub_topic=value.get("pubsub_topic") or base.pubsub_topic,
        pubsub_subscription=value.get("pubsub_subscription") or base.pubsub_subscription,
        push_mode=value.get("push_mode") or base.push_mode,
        push_audience=value.get("push_audience", base.push_audience),
        push_service_account=value.get("push_service_account", base.push_service_account),
        source="database",
    )


async def invalidate() -> None:
    global _cache
    _cache = None
    await get_redis().incr(VERSION_KEY)
