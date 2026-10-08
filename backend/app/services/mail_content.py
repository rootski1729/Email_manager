"""Read an alerted email in full, live from its mailbox (bodies and files are never stored).

Used by WhatsApp (/open, /thread, /files), the website's full-email view and attachment downloads,
and the AI assistant.
"""

from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import vault
from app.models import Mailbox, Message
from app.providers import get_provider
from app.providers.base import ProviderError, ReauthRequired
from app.providers.html_view import SafeHtml, safe_email_html
from app.providers.mime import AttachmentPart, attachment_parts
from app.providers.reading import Reading, ThreadMessage, read_email, thread_messages
from app.rules.envelope import Envelope


class ContentError(Exception):
    """A user-facing reason the email can't be read right now."""


@dataclass
class FullEmail:
    env: Envelope
    raw: bytes = field(repr=False)
    reading: Reading

    @property
    def thread(self) -> list[ThreadMessage]:
        return thread_messages(self.reading.history) if self.reading.history else []

    def files(self) -> list[AttachmentPart]:
        return attachment_parts(self.raw)

    def html(self) -> SafeHtml | None:
        """The formatted (HTML) version, cleaned; quoted history is dropped from replies."""
        return safe_email_html(self.raw, drop_quotes=self.reading.kind == "reply")


async def fetch_full(db: AsyncSession, message: Message) -> FullEmail:
    mailbox = await db.get(Mailbox, message.mailbox_id)
    if mailbox is None:
        raise ContentError("That mailbox is no longer connected.")
    try:
        creds = vault().decrypt_json(mailbox.credentials)
        async with get_provider(mailbox.provider).open(mailbox.id, mailbox.address, creds) as session:
            loaded = await session.load_full(message.provider_message_id)
    except ReauthRequired as exc:
        raise ContentError(f"I can't read {mailbox.address} right now: reconnect it in the app.") from exc
    except ProviderError as exc:
        if "too large" in str(exc):
            raise ContentError(str(exc)) from exc
        raise ContentError("I couldn't reach your mailbox just now. Try again in a minute.") from exc
    except (OSError, TimeoutError) as exc:
        raise ContentError("I couldn't reach your mailbox just now. Try again in a minute.") from exc
    if loaded is None:
        raise ContentError("That email no longer exists in your mailbox (it may have been deleted).")
    env, raw = loaded
    reading = read_email(env.body_text, subject=env.subject, in_reply_to=bool(env.header("in-reply-to")))
    return FullEmail(env, raw, reading)
