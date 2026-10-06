"""Atomic multi-bucket token limiter in Redis (one Lua call checks and charges every bucket)."""

from dataclasses import dataclass

from redis.asyncio import Redis

# KEYS = bucket keys. ARGV = triples of (capacity, refill tokens per ms, ttl ms).
# A refill rate of 0 makes a fixed window that resets when the key expires (daily caps).
# Charges one token from every bucket only if all of them have one; otherwise charges nothing
# and returns how long to wait and the index of the bucket that refused.
_SCRIPT = """
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local tokens = {}
local wait, blocker = 0, 0
for i = 1, #KEYS do
  local cap = tonumber(ARGV[(i - 1) * 3 + 1])
  local rate = tonumber(ARGV[(i - 1) * 3 + 2])
  local ttl = tonumber(ARGV[(i - 1) * 3 + 3])
  local state = redis.call('HMGET', KEYS[i], 'tokens', 'ts')
  local have, ts = tonumber(state[1]), tonumber(state[2])
  if have == nil then have, ts = cap, now end
  if rate > 0 then have = math.min(cap, have + (now - ts) * rate) end
  tokens[i] = have
  if have < 1 then
    local w
    if rate > 0 then
      w = math.ceil((1 - have) / rate)
    else
      w = redis.call('PTTL', KEYS[i])
      if w < 0 then w = ttl end
    end
    if w > wait then wait, blocker = w, i end
  end
end
if wait > 0 then return {0, wait, blocker} end
for i = 1, #KEYS do
  local rate = tonumber(ARGV[(i - 1) * 3 + 2])
  local ttl = tonumber(ARGV[(i - 1) * 3 + 3])
  local fresh = redis.call('EXISTS', KEYS[i]) == 0
  redis.call('HSET', KEYS[i], 'tokens', tostring(tokens[i] - 1), 'ts', now)
  if rate > 0 or fresh then redis.call('PEXPIRE', KEYS[i], ttl) end
end
return {1, 0, 0}
"""


@dataclass(frozen=True, slots=True)
class Bucket:
    key: str
    capacity: int
    per_seconds: float  # refill `capacity` tokens over this many seconds; 0 = fixed window
    ttl_seconds: int

    @classmethod
    def per_minute(cls, key: str, rate: int, burst: int | None = None) -> "Bucket":
        burst = burst or rate
        # refill `rate` tokens per 60 s, capped at `burst`
        return cls(key=key, capacity=burst, per_seconds=60 * burst / rate, ttl_seconds=120)

    @classmethod
    def window(cls, key: str, limit: int, ttl_seconds: int) -> "Bucket":
        return cls(key=key, capacity=limit, per_seconds=0, ttl_seconds=ttl_seconds)


@dataclass(frozen=True, slots=True)
class Decision:
    allowed: bool
    retry_after_s: float = 0.0
    blocked_by: str | None = None


class RateLimiter:
    def __init__(self, redis: Redis) -> None:
        self._script = redis.register_script(_SCRIPT)

    async def acquire(self, *buckets: Bucket) -> Decision:
        args: list[float] = []
        for b in buckets:
            rate_per_ms = 0 if b.per_seconds == 0 else b.capacity / (b.per_seconds * 1000)
            args += [b.capacity, rate_per_ms, b.ttl_seconds * 1000]
        allowed, wait_ms, blocker = await self._script(keys=[b.key for b in buckets], args=args)
        if int(allowed) == 1:
            return Decision(True)
        return Decision(False, int(wait_ms) / 1000, buckets[int(blocker) - 1].key)


async def tokens_left(redis: Redis, key: str, capacity: int) -> float:
    value = await redis.hget(key, "tokens")
    return capacity if value is None else float(value)
