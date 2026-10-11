"""Search all of a user's mailboxes at once, live, and keep the emails they choose to act on.

Each mailbox is searched with its own engine (Gmail search, IMAP SEARCH) in parallel, with a time limit, so one
slow or broken mailbox never blocks the others. Results carry only what's needed to show and open them. An email
becomes a stored `messages` row (metadata only, with a #code) only when the user opens it or replies to it.
"""

import asyncio
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import uuid7
from app.core.logging import log
from app.core.security import vault
from app.models import Mailbox, MailboxStatus, Message, User
from app.providers import get_provider
from app.providers.base import ProviderError, ReauthRequired
from app.providers.mime import readable_preview
from app.providers.reading import read_email
from app.providers.search import SearchQuery
from app.rules.envelope import Envelope
from app.services.ingest import KEPT_HEADERS, next_ref

PER_MAILBOX_LIMIT = 8
MAILBOX_TIMEOUT_S = 25.0
MAX_RESULTS = 10


@dataclass
class Hit:
    mailbox_id: str
    mailbox: str  # the mailbox's address
    ref: str  # the provider's message id
    from_name: str
    from_address: str
    subject: str
    date: str  # ISO 8601
    snippet: str
    has_attachments: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SearchOutcome:
    hits: list[Hit]
    searched: list[str]  # mailbox addresses that answered
    problems: list[str]  # plain-language notes about mailboxes that couldn't be searched


class SearchError(Exception):
    """A user-facing reason a search or an email couldn't be completed."""


async def searchable_mailboxes(db: AsyncSession, user_id: UUID) -> list[Mailbox]:
    return list((await db.scalars(select(Mailbox).where(
        Mailbox.user_id == user_id,
        Mailbox.status.in_([MailboxStatus.active, MailboxStatus.paused, MailboxStatus.error]),
    ).order_by(Mailbox.created_at))).all())


def _hit(mailbox: Mailbox, env: Envelope) -> Hit:
    text = env.body_text
    preview = readable_preview(read_email(text, subject=env.subject).main_text, 220) if text else ""
    return Hit(mailbox_id=str(mailbox.id), mailbox=mailbox.address, ref=env.provider_message_id,
               from_name=env.from_name or "", from_address=env.from_address, subject=env.subject or "",
               date=env.received_at.isoformat(), snippet=" ".join((preview or env.snippet or "").split())[:240],
               has_attachments=bool(env.attachments))


async def _search_one(mailbox: Mailbox, query: SearchQuery, limit: int) -> list[Hit]:
    creds = vault().decrypt_json(mailbox.credentials)
    hits: list[Hit] = []
    async with get_provider(mailbox.provider).open(mailbox.id, mailbox.address, creds) as session:
        for ref in await session.search(query, limit):
            # Gmail's metadata includes a snippet; IMAP needs the message for one (capped by the provider).
            env = await session.load(ref, full=mailbox.provider.value == "imap")
            if env is None:
                continue
            if query.has_attachment and mailbox.provider.value == "imap" and not env.attachments:
                continue  # IMAP SEARCH can't filter on attachments
            hits.append(_hit(mailbox, env))
    return hits


async def search_all(
    db: AsyncSession, user: User, query: SearchQuery, *, mailbox: str | None = None, limit: int = MAX_RESULTS,
) -> SearchOutcome:
    boxes = await searchable_mailboxes(db, user.id)
    if mailbox:
        wanted = mailbox.lower()
        boxes = [b for b in boxes if wanted in b.address.lower()] or boxes
    if not boxes:
        raise SearchError("You haven't connected a mailbox yet. Add one in the app under Mailboxes.")

    async def guarded(box: Mailbox) -> list[Hit] | str:
        try:
            return await asyncio.wait_for(_search_one(box, query, PER_MAILBOX_LIMIT), MAILBOX_TIMEOUT_S)
        except ReauthRequired:
            return f"{box.address} needs to be reconnected"
        except (ProviderError, OSError, TimeoutError) as exc:
            log.warning("mail_search_failed", mailbox_id=str(box.id), error=type(exc).__name__)
            return f"{box.address} didn't answer"

    answers = await asyncio.gather(*(guarded(b) for b in boxes))
    hits = [h for a in answers if isinstance(a, list) for h in a]
    hits.sort(key=lambda h: h.date, reverse=True)
    return SearchOutcome(hits=hits[:limit],
                         searched=[b.address for b, a in zip(boxes, answers, strict=True) if isinstance(a, list)],
                         problems=[a for a in answers if isinstance(a, str)])


async def keep(db: AsyncSession, user: User, hit: dict[str, Any]) -> Message:
    """Store a found email (metadata only) so it gets a #code and every alert action works on it."""
    mailbox = await db.get(Mailbox, UUID(hit["mailbox_id"]))
    if mailbox is None or mailbox.user_id != user.id:
        raise SearchError("That mailbox is no longer connected.")
    existing = await db.scalar(select(Message).where(Message.mailbox_id == mailbox.id,
                                                     Message.provider_message_id == hit["ref"]))
    if existing is not None:
        return existing
    try:
        creds = vault().decrypt_json(mailbox.credentials)
        async with get_provider(mailbox.provider).open(mailbox.id, mailbox.address, creds) as session:
            env = await session.load(hit["ref"], full=True)
    except ReauthRequired as exc:
        raise SearchError(f"I can't read {mailbox.address} right now: reconnect it in the app.") from exc
    except (ProviderError, OSError, TimeoutError) as exc:
        raise SearchError("I couldn't reach your mailbox just now. Try again in a minute.") from exc
    if env is None:
        raise SearchError("That email no longer exists in your mailbox.")
    reading = read_email(env.body_text, subject=env.subject) if env.body_text else None
    preview = readable_preview(reading.main_text, 600) if reading else (env.snippet or "")
    message_id = uuid7()
    await db.execute(insert(Message).values(
        id=message_id, user_id=user.id, mailbox_id=mailbox.id, provider_message_id=env.provider_message_id,
        thread_id=env.thread_id, from_address=env.from_address[:320],
        from_name=(env.from_name or None) and env.from_name[:320], to_addresses=[*env.to, *env.cc][:50],
        subject=env.subject, snippet=preview or None, received_at=env.received_at or datetime.now(UTC),
        list_id=(env.list_id or None) and env.list_id[:320], has_attachments=bool(env.attachments),
        web_url=env.web_url, ref=await next_ref(db, user.id),
        headers={k: v for k, v in env.headers.items() if k in KEPT_HEADERS},
    ).on_conflict_do_nothing(index_elements=["mailbox_id", "provider_message_id"]))
    await db.flush()
    stored = await db.scalar(select(Message).where(Message.mailbox_id == mailbox.id,
                                                   Message.provider_message_id == env.provider_message_id))
    assert stored is not None
    return stored
