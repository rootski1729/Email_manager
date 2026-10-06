"""Live events for the web UI (Redis pub/sub → SSE) and fast daily counters."""

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.core.redis import Keys, get_redis

STATS_FIELDS = ("scanned", "matched", "sent", "failed")
STATS_TTL_S = 120 * 24 * 3600


async def publish(user_id: UUID | str, event: str, data: dict[str, Any]) -> None:
    message = json.dumps({"event": event, "data": data, "at": datetime.now(UTC).isoformat()}, default=str)
    await get_redis().publish(Keys.events(user_id), message)


async def bump(user_id: UUID | str, **counts: int) -> None:
    key = Keys.stats(user_id, datetime.now(UTC).strftime("%Y%m%d"))
    pipe = get_redis().pipeline(transaction=False)
    for name, value in counts.items():
        if value:
            pipe.hincrby(key, name, value)
    pipe.expire(key, STATS_TTL_S)
    await pipe.execute()


async def daily_stats(user_id: UUID | str, days: int) -> list[dict[str, Any]]:
    today = datetime.now(UTC).date()
    keys = [(today - timedelta(days=i)) for i in range(days - 1, -1, -1)]
    pipe = get_redis().pipeline(transaction=False)
    for d in keys:
        pipe.hgetall(Keys.stats(user_id, d.strftime("%Y%m%d")))
    rows = await pipe.execute()
    return [
        {"date": d.isoformat(), **{f: int(row.get(f, 0)) for f in STATS_FIELDS}}
        for d, row in zip(keys, rows, strict=True)
    ]


async def wake_dispatcher() -> None:
    redis = get_redis()
    pipe = redis.pipeline(transaction=False)
    pipe.lpush(Keys.DISPATCHER_WAKE, "1")
    pipe.ltrim(Keys.DISPATCHER_WAKE, 0, 0)
    await pipe.execute()
