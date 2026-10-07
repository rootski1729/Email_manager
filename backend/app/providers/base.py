from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol
from uuid import UUID

from app.rules.envelope import Envelope


class ProviderError(Exception):
    """Transient provider failure: the sync is retried later and the cursor is not advanced."""


class ReauthRequired(ProviderError):
    """Credentials were revoked or are wrong; the user must reconnect the mailbox."""


class MailSession(Protocol):
    """An open connection to one mailbox for the duration of a sync."""

    async def fetch_new(self, cursor: dict[str, Any]) -> tuple[list[str], dict[str, Any]]:
        """Return provider message ids added since `cursor`, and the cursor to store afterwards."""
        ...

    async def load(self, ref: str, *, full: bool) -> Envelope | None:
        """Load one message. `full=False` loads headers (and a snippet when cheap)."""
        ...

    async def load_full(self, ref: str) -> tuple[Envelope, bytes] | None:
        """The full message and its raw RFC 5322 bytes (attachments included)."""
        ...

    async def recent(self, limit: int) -> list[str]:
        """Most recent inbox message ids, newest first (used for rule previews)."""
        ...

    @property
    def credentials(self) -> dict[str, Any]:
        """Credentials after the session; may differ from the input (refreshed tokens)."""
        ...


class MailProvider(Protocol):
    def open(
        self, mailbox_id: UUID, address: str, credentials: dict[str, Any]
    ) -> AbstractAsyncContextManager[MailSession]: ...
