from sqlalchemy import select

from app.core.db import session_factory
from app.models import Mailbox, MailboxStatus, Provider
from app.services.ingest import request_sync


async def handle_gmail_notification(address: str) -> int:
    """A Gmail push says `address` changed: queue a sync for every user who connected it."""
    async with session_factory()() as db:
        ids = (await db.scalars(select(Mailbox.id).where(
            Mailbox.provider == Provider.gmail, Mailbox.address == address.lower(),
            Mailbox.status.in_([MailboxStatus.active, MailboxStatus.error]),
        ))).all()
    for mailbox_id in ids:
        await request_sync(mailbox_id)
    return len(ids)
