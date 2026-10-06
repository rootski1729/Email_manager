"""Immediate sends (login codes) that bypass the outbox but still respect the global limit."""

import asyncio

from app.core.config import get_settings
from app.core.redis import Keys, get_redis
from app.notify.ratelimit import Bucket, RateLimiter
from app.notify.waha import WahaClient, WahaError

MAX_WAIT_S = 10.0


async def send_now(chat_id: str, text: str) -> str:
    settings = get_settings()
    limiter = RateLimiter(get_redis())
    bucket = Bucket.per_minute(Keys.RATE_GLOBAL, settings.rate_global_per_min, settings.rate_global_burst)
    waited = 0.0
    while True:
        decision = await limiter.acquire(bucket)
        if decision.allowed:
            break
        if waited + decision.retry_after_s > MAX_WAIT_S:
            raise WahaError("WhatsApp sender is busy, try again shortly", retryable=True)
        await asyncio.sleep(decision.retry_after_s)
        waited += decision.retry_after_s
    return await WahaClient().send_text(chat_id, text)
