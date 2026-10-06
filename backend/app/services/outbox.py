"""Writing to the notification outbox. Rows are inserted inside the caller's transaction."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import uuid7
from app.core.security import sha256
from app.models import (
    Destination,
    Notification,
    NotificationKind,
    NotificationStatus,
    User,
    UserSettings,
)
from app.services.schedule import digest_due, in_quiet_hours


async def default_destination(db: AsyncSession, user_id: UUID) -> Destination | None:
    return await db.scalar(
        select(Destination)
        .where(Destination.user_id == user_id, Destination.verified_at.is_not(None))
        .order_by(Destination.is_default.desc(), Destination.created_at)
        .limit(1)
    )


async def resolve_destinations(db: AsyncSession, user_id: UUID, ids: set[UUID]) -> list[Destination]:
    if ids:
        rows = (await db.scalars(select(Destination).where(
            Destination.user_id == user_id, Destination.id.in_(ids), Destination.verified_at.is_not(None)
        ))).all()
        if rows:
            return list(rows)
    fallback = await default_destination(db, user_id)
    return [fallback] if fallback else []


async def enqueue(
    db: AsyncSession, *, user_id: UUID, destination: Destination, kind: NotificationKind,
    payload: dict[str, Any], dedupe: str, message_id: UUID | None = None, hold_for_digest: bool = False,
    delay_s: float = 0,
) -> bool:
    """Insert one outbox row; returns False when an identical notification already exists."""
    status = NotificationStatus.held if hold_for_digest else NotificationStatus.queued
    stmt = insert(Notification).values(
        id=uuid7(), user_id=user_id, destination_id=destination.id, chat_id=destination.chat_id,
        message_id=message_id, kind=kind, payload=payload, status=status,
        held_reason="digest" if hold_for_digest else None,
        next_attempt_at=datetime.now(UTC) + timedelta(seconds=delay_s),
        dedupe_key=sha256(f"{dedupe}:{destination.chat_id}"),
    ).on_conflict_do_nothing(index_elements=["dedupe_key"])
    result = await db.execute(stmt)
    return bool(getattr(result, "rowcount", 0))


async def enqueue_system(db: AsyncSession, user_id: UUID, text: str, dedupe: str) -> None:
    destination = await default_destination(db, user_id)
    if destination:
        await enqueue(db, user_id=user_id, destination=destination, kind=NotificationKind.system,
                      payload={"text": text}, dedupe=f"system:{dedupe}")


async def flush_held(db: AsyncSession, now: datetime | None = None) -> int:
    """Turn held alerts into one digest per destination when quiet hours end or the digest is due."""
    now = now or datetime.now(UTC)
    held = (await db.scalars(
        select(Notification).where(Notification.status == NotificationStatus.held)
        .order_by(Notification.created_at).with_for_update(skip_locked=True)
    )).all()
    if not held:
        return 0
    by_user: dict[UUID, list[Notification]] = defaultdict(list)
    for n in held:
        by_user[n.user_id].append(n)
    users = {u.id: u for u in (await db.scalars(select(User).where(User.id.in_(by_user)))).all()}
    prefs = {s.user_id: s for s in (await db.scalars(
        select(UserSettings).where(UserSettings.user_id.in_(by_user)))).all()}

    created = 0
    for user_id, rows in by_user.items():
        user, pref = users.get(user_id), prefs.get(user_id)
        timezone = user.timezone if user else "UTC"
        quiet = in_quiet_hours(pref.quiet_hours if pref else None, timezone, now)
        due_digest = digest_due(pref.digest if pref else None, timezone,
                                pref.last_digest_at if pref else None, now)
        ready = [
            n for n in rows
            if (n.held_reason == "quiet_hours" and not quiet)
            or (n.held_reason == "digest" and due_digest and not quiet)
            or (n.held_reason == "digest" and not (pref and (pref.digest or {}).get("enabled")) and not quiet)
        ]
        by_chat: dict[tuple[str, UUID | None], list[Notification]] = defaultdict(list)
        for n in ready:
            by_chat[(n.chat_id, n.destination_id)].append(n)
        for (chat_id, destination_id), items in by_chat.items():
            if len(items) == 1 and items[0].held_reason == "quiet_hours":
                items[0].status = NotificationStatus.queued
                items[0].held_reason = None
                items[0].next_attempt_at = now
                continue
            digest_id = uuid7()
            digest_title = ("While you were away" if all(i.held_reason == "quiet_hours" for i in items)
                            else "Your email digest")
            db.add(Notification(
                id=digest_id, user_id=user_id, destination_id=destination_id, chat_id=chat_id,
                kind=NotificationKind.digest, status=NotificationStatus.queued, next_attempt_at=now,
                payload={"title": f"{digest_title}: {len(items)} important emails",
                         "items": [i.payload for i in items]},
                dedupe_key=sha256(f"digest:{digest_id}"),
            ))
            await db.flush()
            await db.execute(
                update(Notification).where(Notification.id.in_([i.id for i in items]))
                .values(status=NotificationStatus.folded, parent_id=digest_id)
            )
            created += 1
        if due_digest and pref and any(n.held_reason == "digest" for n in ready):
            pref.last_digest_at = now
    await db.commit()
    return created


def backoff_seconds(attempts: int) -> float:
    return float(min(30 * 2 ** max(attempts - 1, 0), 1800))


def max_attempts() -> int:
    return get_settings().max_delivery_attempts
