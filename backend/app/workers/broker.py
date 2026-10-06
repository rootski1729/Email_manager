"""Taskiq broker on Redis Streams (consumer groups + acks: unacked jobs are redelivered)."""

import asyncio
import contextlib
import socket

from taskiq import TaskiqEvents, TaskiqScheduler, TaskiqState
from taskiq.middlewares import SimpleRetryMiddleware
from taskiq.schedule_sources import LabelScheduleSource
from taskiq_redis import RedisStreamBroker

from app.core.config import get_settings
from app.core.db import dispose_engine
from app.core.http import close_http
from app.core.logging import configure_logging, log
from app.core.redis import Keys, close_redis, get_redis

TASK_STREAM = "mailsentinel:tasks"
TASK_GROUP = "workers"

broker = RedisStreamBroker(
    url=get_settings().redis_url,
    queue_name=TASK_STREAM,
    consumer_group_name=TASK_GROUP,
    maxlen=50_000,
    idle_timeout=10 * 60 * 1000,  # redeliver jobs a crashed worker never acked
).with_middlewares(SimpleRetryMiddleware(default_retry_count=2))

scheduler = TaskiqScheduler(broker=broker, sources=[LabelScheduleSource(broker)])


async def _heartbeat() -> None:
    name = socket.gethostname()
    while True:
        await get_redis().set(Keys.WORKER_HEARTBEAT, name, ex=45)
        await asyncio.sleep(15)


@broker.on_event(TaskiqEvents.WORKER_STARTUP)
async def _startup(state: TaskiqState) -> None:
    configure_logging()
    from app.services import compose, ingest
    from app.workers import tasks

    ingest.kick_sync = tasks.kick_sync
    compose.kick_send = tasks.kick_send
    state.heartbeat = asyncio.create_task(_heartbeat())
    log.info("worker_started")


@broker.on_event(TaskiqEvents.WORKER_SHUTDOWN)
async def _shutdown(state: TaskiqState) -> None:
    task = getattr(state, "heartbeat", None)
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    await dispose_engine()
    await close_redis()
    await close_http()
