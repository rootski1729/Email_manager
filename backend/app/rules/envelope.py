from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID


@dataclass(slots=True)
class Attachment:
    name: str
    mime_type: str
    size: int = 0


@dataclass(slots=True)
class Envelope:
    """A provider-independent view of one email, used by the rule engine."""

    mailbox_id: UUID
    provider_message_id: str
    received_at: datetime
    from_address: str = ""
    from_name: str = ""
    to: list[str] = field(default_factory=list)
    cc: list[str] = field(default_factory=list)
    reply_to: list[str] = field(default_factory=list)
    subject: str = ""
    snippet: str = ""
    body_text: str | None = None  # None when only headers were loaded
    # Lower-cased header name -> values
    headers: dict[str, list[str]] = field(default_factory=dict)
    attachments: list[Attachment] = field(default_factory=list)
    thread_id: str | None = None
    web_url: str | None = None

    @property
    def from_domain(self) -> str:
        return domain_of(self.from_address)

    @property
    def list_id(self) -> str | None:
        values = self.headers.get("list-id")
        return values[0] if values else None

    @property
    def is_full(self) -> bool:
        return self.body_text is not None

    def header(self, name: str) -> list[str]:
        return self.headers.get(name.lower(), [])


def domain_of(address: str) -> str:
    return address.rsplit("@", 1)[-1].lower() if "@" in address else ""
