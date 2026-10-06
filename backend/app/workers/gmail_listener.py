"""Pull Gmail change notifications from Pub/Sub (no public URL needed). Run: python -m app.workers.gmail_listener"""

import asyncio
import json
import signal
import socket
from typing import Any

from app.core.config import get_settings
from app.core.db import dispose_engine
from app.core.logging import configure_logging, log
from app.core.redis import Keys, close_redis, get_redis
from app.services import ingest
from app.services.gmail_intake import handle_gmail_notification
from app.workers.broker import broker
from app.workers.tasks import kick_sync


async def main() -> None:
    configure_logging()
    settings = get_settings()
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)

    if settings.gmail_push_mode != "pull" or not settings.google_project_id:
        log.info("gmail_listener_idle", reason="pull mode disabled or GOOGLE_PROJECT_ID unset")
        await stop.wait()
        return

    from google.cloud import pubsub_v1

    await broker.startup()
    ingest.kick_sync = kick_sync
    subscriber = pubsub_v1.SubscriberClient()
    path = subscriber.subscription_path(settings.google_project_id, settings.google_pubsub_subscription)

    def callback(message: Any) -> None:
        try:
            data = json.loads(message.data or b"{}")
            address = data.get("emailAddress")
            if address:
                asyncio.run_coroutine_threadsafe(handle_gmail_notification(address), loop).result(timeout=30)
            message.ack()
        except Exception:
            log.exception("gmail_notification_failed")
            message.nack()

    flow = pubsub_v1.types.FlowControl(max_messages=50)
    future = subscriber.subscribe(path, callback=callback, flow_control=flow)
    log.info("gmail_listener_started", subscription=path)
    try:
        while not stop.is_set():
            await get_redis().set(Keys.LISTENER_HEARTBEAT, socket.gethostname(), ex=45)
            try:
                await asyncio.wait_for(stop.wait(), timeout=15)
            except TimeoutError:
                pass
            if future.done():
                future.result()  # surface the error and let Docker restart us
    finally:
        future.cancel()
        subscriber.close()
        await broker.shutdown()
        await dispose_engine()
        await close_redis()


if __name__ == "__main__":
    asyncio.run(main())
