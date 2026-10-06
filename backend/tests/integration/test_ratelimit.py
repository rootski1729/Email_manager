import asyncio

from app.core.redis import get_redis
from app.notify.ratelimit import Bucket, RateLimiter


async def test_token_bucket_burst_then_refill(infra):
    limiter = RateLimiter(get_redis())
    bucket = Bucket.per_minute("rl:test:a", rate=600, burst=3)  # 10/s refill
    results = [(await limiter.acquire(bucket)).allowed for _ in range(4)]
    assert results == [True, True, True, False]
    await asyncio.sleep(0.15)
    assert (await limiter.acquire(bucket)).allowed


async def test_all_or_nothing_across_buckets(infra):
    limiter = RateLimiter(get_redis())
    roomy = Bucket.per_minute("rl:test:roomy", rate=60, burst=10)
    tight = Bucket.per_minute("rl:test:tight", rate=1, burst=1)
    assert (await limiter.acquire(roomy, tight)).allowed
    denied = await limiter.acquire(roomy, tight)
    assert not denied.allowed and denied.blocked_by == "rl:test:tight" and 50 < denied.retry_after_s <= 60
    # The roomy bucket was not charged for the refused attempt: 9 tokens left.
    assert float(await get_redis().hget("rl:test:roomy", "tokens")) >= 8.9


async def test_fixed_window(infra):
    limiter = RateLimiter(get_redis())
    window = Bucket.window("rl:test:daily", limit=2, ttl_seconds=60)
    assert [(await limiter.acquire(window)).allowed for _ in range(3)] == [True, True, False]
    assert 0 < await get_redis().ttl("rl:test:daily") <= 60
