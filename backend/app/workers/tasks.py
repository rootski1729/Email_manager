"""Background jobs. Periodic ones are picked up by `taskiq scheduler` from their schedule labels."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, or_, select

from app.core.db import session_factory
from app.core.logging import log
from app.core.security import vault
from app.models import Mailbox, MailboxStatus, Notification, NotificationStatus, Provider, RefreshToken
from app.providers.base import ProviderError
from app.providers.gmail import GmailSession
from app.services import compose, ingest, outbox, recap
from app.services.events import wake_dispatcher
from app.workers.broker import broker

GMAIL_SAFETY_POLL = timedelta(minutes=5)
NOTIFICATION_RETENTION = timedelta(days=90)


@broker.task(task_name="sync_mailbox", retry_on_error=False)
async def sync_mailbox(mailbox_id: str) -> dict:
    return await ingest.sync_mailbox(UUID(mailbox_id))


async def kick_sync(mailbox_id: str) -> None:
    await sync_mailbox.kiq(mailbox_id)


@broker.task(task_name="handle_whatsapp_message", retry_on_error=False)
async def handle_whatsapp_message(payload: dict) -> str:
    return await compose.handle_inbound(payload)


@broker.task(task_name="send_outbound_email", retry_on_error=False)
async def send_outbound_email(email_id: str) -> str:
    return await compose.send_outbound(UUID(email_id))


async def kick_send(email_id: str) -> None:
    await send_outbound_email.kiq(email_id)


@broker.task(task_name="expire_drafts", schedule=[{"cron": "* * * * *"}])
async def expire_drafts() -> int:
    return await compose.expire_drafts()


@broker.task(task_name="weekly_recap", schedule=[{"cron": "*/15 * * * *"}])
async def weekly_recap() -> int:
    return await recap.send_due_recaps()


@broker.task(task_name="schedule_polls", schedule=[{"cron": "* * * * *"}])
async def schedule_polls() -> int:
    """IMAP has no push, so poll every minute. Gmail gets a safety poll in case a push was missed."""
    now = datetime.now(UTC)
    async with session_factory()() as db:
        rows = (await db.execute(select(Mailbox.id, Mailbox.provider, Mailbox.last_synced_at,
                                        Mailbox.watch_expires_at)
                                 .where(Mailbox.status.in_([MailboxStatus.active, MailboxStatus.error])))).all()
    queued = 0
    for mailbox_id, provider, last_synced, watch_expires in rows:
        if provider == Provider.gmail and watch_expires and watch_expires > now and last_synced \
                and now - last_synced < GMAIL_SAFETY_POLL:
            continue
        queued += await ingest.request_sync(mailbox_id)
    return queued


@broker.task(task_name="renew_gmail_watches", schedule=[{"cron": "17 * * * *"}])
async def renew_gmail_watches() -> int:
    """Gmail watches expire after 7 days; Google recommends renewing daily."""
    renew_before = datetime.now(UTC) + timedelta(days=6)
    renewed = 0
    async with session_factory()() as db:
        mailboxes = (await db.scalars(select(Mailbox).where(
            Mailbox.provider == Provider.gmail, Mailbox.status == MailboxStatus.active,
            or_(Mailbox.watch_expires_at.is_(None), Mailbox.watch_expires_at < renew_before),
        ))).all()
        for mailbox in mailboxes:
            creds = vault().decrypt_json(mailbox.credentials)
            session = GmailSession(mailbox.id, mailbox.address, creds)
            try:
                watch = await session.watch()
            except ProviderError as exc:
                log.warning("watch_renew_failed", mailbox_id=str(mailbox.id), error=str(exc))
                continue
            if watch:
                mailbox.watch_expires_at = watch["expires_at"]
                renewed += 1
            if session.credentials != creds:
                mailbox.credentials = vault().encrypt_json(session.credentials)
        await db.commit()
    return renewed


@broker.task(task_name="flush_held", schedule=[{"cron": "* * * * *"}])
async def flush_held() -> int:
    async with session_factory()() as db:
        created = await outbox.flush_held(db)
    if created:
        await wake_dispatcher()
    return created


@broker.task(task_name="cleanup", schedule=[{"cron": "40 3 * * *"}])
async def cleanup() -> None:
    now = datetime.now(UTC)
    async with session_factory()() as db:
        await db.execute(delete(RefreshToken).where(RefreshToken.expires_at < now - timedelta(days=1)))
        await db.execute(delete(Notification).where(
            Notification.created_at < now - NOTIFICATION_RETENTION,
            Notification.status.in_([NotificationStatus.sent, NotificationStatus.delivered,
                                     NotificationStatus.read, NotificationStatus.folded,
                                     NotificationStatus.dead])))
        await db.commit()
