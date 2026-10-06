"""The only process that talks to WhatsApp. Drains the outbox within global limits.

Run with: python -m app.notify.dispatcher
"""

import asyncio
import json
import random
import signal
import socket
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from prometheus_client import Counter, Gauge, start_http_server
from sqlalchemy import or_, select, update

from app.core.config import PLANS, get_settings
from app.core.db import dispose_engine, session_factory
from app.core.http import close_http
from app.core.logging import configure_logging, log
from app.core.redis import Keys, close_redis, get_redis
from app.models import Notification, NotificationKind, NotificationStatus, User, UserSettings
from app.notify import guard
from app.notify.ratelimit import Bucket, RateLimiter
from app.notify.templates import render_many, render_payload
from app.notify.waha import WahaClient, WahaError
from app.services import events
from app.services.outbox import backoff_seconds
from app.services.schedule import in_quiet_hours

BATCH = 50
STUCK_AFTER = timedelta(minutes=5)
HEALTH_EVERY_S = 15

SENT = Counter("ms_notifications_sent_total", "WhatsApp messages sent", ["kind"])
FAILED = Counter("ms_notifications_failed_total", "Failed send attempts", ["retryable"])
DENIED = Counter("ms_rate_limit_denied_total", "Sends postponed by a rate limit", ["bucket"])
WAHA_UP = Gauge("ms_waha_session_up", "1 when the WAHA session is WORKING")


@dataclass
class Circuit:
    """Opens after repeated WAHA failures so we stop hammering a broken session."""

    threshold: int = 5
    cooldown_s: float = 60
    failures: int = 0
    opened_at: float = 0

    @property
    def open(self) -> bool:
        return self.failures >= self.threshold and time.monotonic() - self.opened_at < self.cooldown_s

    def success(self) -> None:
        self.failures = 0

    def failure(self) -> None:
        self.failures += 1
        if self.failures >= self.threshold:
            self.opened_at = time.monotonic()


@dataclass
class Dispatcher:
    waha: WahaClient = field(default_factory=WahaClient)
    circuit: Circuit = field(default_factory=Circuit)
    instance: str = field(default_factory=lambda: f"{socket.gethostname()}:{random.getrandbits(32):x}")
    sleep: bool = True  # jitter between sends; disabled in tests
    _stop: asyncio.Event = field(default_factory=asyncio.Event)
    _last_health: float = 0
    _session_ok: bool = False

    def __post_init__(self) -> None:
        self.settings = get_settings()
        self.redis = get_redis()
        self.limiter = RateLimiter(self.redis)

    def stop(self) -> None:
        self._stop.set()

    async def is_leader(self) -> bool:
        key = Keys.DISPATCHER_LEADER
        if await self.redis.set(key, self.instance, nx=True, ex=15):
            log.info("dispatcher_leader_acquired", instance=self.instance)
            return True
        if await self.redis.get(key) == self.instance:
            await self.redis.expire(key, 15)
            return True
        return False

    async def check_health(self, force: bool = False) -> bool:
        if not force and time.monotonic() - self._last_health < HEALTH_EVERY_S:
            return self._session_ok and not self.circuit.open
        self._last_health = time.monotonic()
        info: dict[str, Any]
        try:
            info = await self.waha.session_info()
            status = info.get("status", "UNKNOWN")
        except WahaError as exc:
            info, status = {"error": str(exc)}, "UNREACHABLE"
        self._session_ok = status == "WORKING"
        WAHA_UP.set(1 if self._session_ok else 0)
        health = {"status": status, "circuit_open": self.circuit.open, "checked_at": datetime.now(UTC).isoformat(),
                  "me": (info.get("me") or {}).get("id"), "dry_run": bool(info.get("dry_run"))}
        await self.redis.set(Keys.WAHA_HEALTH, json.dumps(health), ex=120)
        return self._session_ok and not self.circuit.open

    async def recover_stuck(self) -> None:
        async with session_factory()() as db:
            await db.execute(
                update(Notification)
                .where(Notification.status == NotificationStatus.sending,
                       Notification.updated_at < datetime.now(UTC) - STUCK_AFTER)
                .values(status=NotificationStatus.failed, last_error="dispatcher restarted mid-send",
                        next_attempt_at=datetime.now(UTC))
            )
            await db.commit()

    async def claim(self) -> list[Notification]:
        async with session_factory()() as db:
            rows = (await db.scalars(
                select(Notification)
                .where(or_(Notification.status == NotificationStatus.queued,
                           Notification.status == NotificationStatus.failed),
                       Notification.next_attempt_at <= datetime.now(UTC))
                .order_by(Notification.next_attempt_at)
                .limit(BATCH)
                .with_for_update(skip_locked=True)
            )).all()
            for row in rows:
                row.status = NotificationStatus.sending
            await db.commit()
            return list(rows)

    async def next_due_in(self) -> float:
        async with session_factory()() as db:
            due = await db.scalar(
                select(Notification.next_attempt_at)
                .where(Notification.status.in_([NotificationStatus.queued, NotificationStatus.failed]))
                .order_by(Notification.next_attempt_at).limit(1)
            )
        if due is None:
            return 5.0
        return max(0.0, min(5.0, (due - datetime.now(UTC)).total_seconds()))

    async def tick(self) -> int:
        rows = await self.claim()
        if not rows:
            return 0
        user_ids = {r.user_id for r in rows}
        async with session_factory()() as db:
            users = {u.id: u for u in (await db.scalars(select(User).where(User.id.in_(user_ids)))).all()}
            prefs = {s.user_id: s for s in (await db.scalars(
                select(UserSettings).where(UserSettings.user_id.in_(user_ids)))).all()}

        groups: dict[tuple[UUID, str], list[Notification]] = defaultdict(list)
        for row in rows:
            groups[(row.user_id, row.chat_id)].append(row)
        for (user_id, chat_id), items in groups.items():
            if self._stop.is_set():
                await self._release(items)
                continue
            await self._deliver_group(users.get(user_id), prefs.get(user_id), chat_id, items)
        return len(rows)

    async def _release(self, items: list[Notification], delay_s: float = 0, error: str | None = None) -> None:
        async with session_factory()() as db:
            await db.execute(
                update(Notification).where(Notification.id.in_([i.id for i in items]))
                .values(status=NotificationStatus.queued,
                        next_attempt_at=datetime.now(UTC) + timedelta(seconds=delay_s),
                        **({"last_error": error} if error else {}))
            )
            await db.commit()

    async def _deliver_group(
        self, user: User | None, pref: UserSettings | None, chat_id: str, items: list[Notification]
    ) -> None:
        alerts = [i for i in items if i.kind == NotificationKind.alert]
        others = [i for i in items if i.kind != NotificationKind.alert]
        if alerts and user and in_quiet_hours(pref.quiet_hours if pref else None, user.timezone):
            # Urgent rules (exams, interviews, security) are delivered even during quiet hours.
            held = [a for a in alerts if not a.payload.get("urgent")]
            if held:
                async with session_factory()() as db:
                    await db.execute(
                        update(Notification).where(Notification.id.in_([a.id for a in held]))
                        .values(status=NotificationStatus.held, held_reason="quiet_hours")
                    )
                    await db.commit()
                for a in held:
                    await events.publish(a.user_id, "notification.updated", {"id": str(a.id), "status": "held"})
            alerts = [a for a in alerts if a.payload.get("urgent")]
        # Verification codes and system notices go first and alone; alerts for one chat are merged.
        units: list[tuple[list[Notification], str]] = [([o], render_payload(o.kind, o.payload)) for o in others]
        if alerts:
            units.append((alerts, render_many([a.payload for a in alerts])))
        for unit_items, text in units:
            await self._send(user, pref, chat_id, unit_items, text)

    def _buckets(self, user: User | None, pref: UserSettings | None, destination: str) -> list[Bucket]:
        s = self.settings
        buckets = [
            Bucket.per_minute(Keys.RATE_GLOBAL, s.rate_global_per_min, s.rate_global_burst),
            Bucket.per_minute(Keys.rate_destination(destination), s.rate_destination_per_min),
        ]
        if user:
            cap = PLANS.get(user.plan, PLANS["free"]).daily_alerts
            if pref and pref.daily_cap:
                cap = min(cap, pref.daily_cap)
            day = datetime.now(UTC).strftime("%Y%m%d")
            buckets.append(Bucket.window(Keys.rate_daily(user.id, day), cap, 26 * 3600))
        return buckets

    async def _send(
        self, user: User | None, pref: UserSettings | None, chat_id: str, items: list[Notification], text: str
    ) -> None:
        kinds = {i.kind for i in items}
        system_only = kinds <= {NotificationKind.verification, NotificationKind.system, NotificationKind.reply,
                                NotificationKind.reminder, NotificationKind.recap}
        buckets = self._buckets(None if system_only else user, pref, chat_id)
        decision = await self.limiter.acquire(*buckets)
        if not decision.allowed:
            bucket = (decision.blocked_by or "").split(":")[1] if decision.blocked_by else "unknown"
            DENIED.labels(bucket=bucket).inc()
            if bucket == "daily":
                tomorrow = (datetime.now(UTC) + timedelta(days=1)).replace(hour=0, minute=5, second=0)
                delay = (tomorrow - datetime.now(UTC)).total_seconds()
                await self._release(items, delay, "daily alert cap reached")
            else:
                await self._release(items, decision.retry_after_s + random.uniform(0.2, 1.0))
            return

        if self.sleep:
            lo, hi = self.settings.send_jitter_ms
            await self.waha.typing(chat_id, True)
            await asyncio.sleep(random.uniform(lo, hi) / 1000)
        await guard.remember_text(chat_id, text)
        try:
            provider_id = await self.waha.send_text(chat_id, text)
        except WahaError as exc:
            self.circuit.failure()
            FAILED.labels(retryable=str(exc.retryable).lower()).inc()
            await self._failed(items, exc)
            return
        finally:
            if self.sleep:
                await self.waha.typing(chat_id, False)
        self.circuit.success()
        await guard.remember_id(provider_id)
        for kind in kinds:
            SENT.labels(kind=kind.value).inc()
        now = datetime.now(UTC)
        async with session_factory()() as db:
            await db.execute(
                update(Notification).where(Notification.id.in_([i.id for i in items]))
                .values(status=NotificationStatus.sent, sent_at=now, body=text, provider_message_id=provider_id,
                        attempts=Notification.attempts + 1, last_error=None)
            )
            await db.commit()
        alerts = sum(1 for i in items if i.kind in (NotificationKind.alert, NotificationKind.digest))
        if alerts:
            await events.bump(items[0].user_id, sent=alerts)
        for i in items:
            await events.publish(i.user_id, "notification.updated", {"id": str(i.id), "status": "sent"})

    async def _failed(self, items: list[Notification], exc: WahaError) -> None:
        max_attempts = self.settings.max_delivery_attempts
        async with session_factory()() as db:
            for item in items:
                row = await db.get(Notification, item.id)
                if row is None:
                    continue
                row.attempts += 1
                row.last_error = str(exc)[:500]
                if not exc.retryable or row.attempts >= max_attempts:
                    row.status = NotificationStatus.dead
                else:
                    row.status = NotificationStatus.failed
                    row.next_attempt_at = datetime.now(UTC) + timedelta(seconds=backoff_seconds(row.attempts))
            await db.commit()
        await events.bump(items[0].user_id, failed=len(items))
        for i in items:
            await events.publish(i.user_id, "notification.updated", {"id": str(i.id), "status": "failed"})
        log.warning("send_failed", count=len(items), error=str(exc), retryable=exc.retryable)

    async def run(self) -> None:
        log.info("dispatcher_started", instance=self.instance)
        last_recover = 0.0
        while not self._stop.is_set():
            try:
                if not await self.is_leader():
                    await self._wait(5)
                    continue
                if time.monotonic() - last_recover > 60:
                    await self.recover_stuck()
                    last_recover = time.monotonic()
                if not await self.check_health():
                    await self._wait(5)
                    continue
                if await self.tick() == 0:
                    await self._wait(await self.next_due_in())
            except Exception:
                log.exception("dispatcher_loop_error")
                await self._wait(3)
        if await self.redis.get(Keys.DISPATCHER_LEADER) == self.instance:
            await self.redis.delete(Keys.DISPATCHER_LEADER)
        log.info("dispatcher_stopped")

    async def _wait(self, seconds: float) -> None:
        """Sleep until `seconds` pass or someone pushes to the wake list."""
        if seconds <= 0:
            return
        await self.redis.blpop([Keys.DISPATCHER_WAKE], timeout=max(1, round(seconds)))


async def main() -> None:
    configure_logging()
    start_http_server(9100)
    dispatcher = Dispatcher()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, dispatcher.stop)
    try:
        await dispatcher.run()
    finally:
        await dispose_engine()
        await close_redis()
        await close_http()


if __name__ == "__main__":
    asyncio.run(main())
