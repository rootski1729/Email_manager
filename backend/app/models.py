from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin


def _enum(cls: type[StrEnum]) -> Enum:
    return Enum(cls, native_enum=False, length=32, values_callable=lambda e: [m.value for m in e])


class Role(StrEnum):
    user = "user"
    admin = "admin"


class Provider(StrEnum):
    gmail = "gmail"
    imap = "imap"


class MailboxStatus(StrEnum):
    active = "active"
    paused = "paused"
    reauth_required = "reauth_required"
    error = "error"


class DestinationKind(StrEnum):
    whatsapp_self = "whatsapp_self"
    whatsapp_number = "whatsapp_number"
    whatsapp_group = "whatsapp_group"


class NotificationKind(StrEnum):
    alert = "alert"
    digest = "digest"
    system = "system"
    verification = "verification"
    reply = "reply"  # bot answers to WhatsApp commands (/email, /send, ...)


class OutboundStatus(StrEnum):
    awaiting_confirmation = "awaiting_confirmation"
    queued = "queued"
    sending = "sending"
    sent = "sent"
    failed = "failed"
    cancelled = "cancelled"
    expired = "expired"


class NotificationStatus(StrEnum):
    queued = "queued"
    sending = "sending"
    sent = "sent"
    delivered = "delivered"
    read = "read"
    held = "held"  # waiting for quiet hours to end or for the digest
    folded = "folded"  # merged into another notification (digest/coalesced)
    failed = "failed"  # last attempt failed, will retry
    dead = "dead"  # gave up; manual retry from the UI


class User(IdMixin, TimestampMixin, Base):
    __tablename__ = "users"

    phone_e164: Mapped[str] = mapped_column(String(20), unique=True)
    display_name: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(320))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", server_default="UTC")
    role: Mapped[Role] = mapped_column(_enum(Role), default=Role.user, server_default=Role.user.value)
    plan: Mapped[str] = mapped_column(String(32), default="free", server_default="free")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RefreshToken(IdMixin, Base):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family_id: Mapped[UUID] = mapped_column(index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by: Mapped[UUID | None] = mapped_column()
    user_agent: Mapped[str | None] = mapped_column(String(300))
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserSettings(TimestampMixin, Base):
    __tablename__ = "user_settings"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    # {"enabled": bool, "start": "22:00", "end": "07:00"} in the user's timezone
    quiet_hours: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'"))
    # {"enabled": bool, "time": "08:00"}
    digest: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'"))
    daily_cap: Mapped[int | None] = mapped_column(Integer)
    # Allow composing and sending email from WhatsApp with /email.
    compose_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    last_digest_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Destination(IdMixin, Base):
    __tablename__ = "destinations"
    __table_args__ = (UniqueConstraint("user_id", "chat_id"),)

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[DestinationKind] = mapped_column(_enum(DestinationKind))
    chat_id: Mapped[str] = mapped_column(String(128))
    label: Mapped[str] = mapped_column(String(120))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Mailbox(IdMixin, TimestampMixin, Base):
    __tablename__ = "mailboxes"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", "address"),
        Index("ix_mailboxes_provider_address", "provider", "address"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[Provider] = mapped_column(_enum(Provider))
    address: Mapped[str] = mapped_column(String(320))
    display_name: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[MailboxStatus] = mapped_column(
        _enum(MailboxStatus), default=MailboxStatus.active, server_default=MailboxStatus.active.value
    )
    credentials: Mapped[bytes] = mapped_column(LargeBinary)
    sync_cursor: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'"))
    watch_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    error_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    messages_scanned: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Gmail granted gmail.send, or the IMAP mailbox has SMTP settings.
    can_send: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))


class Rule(IdMixin, TimestampMixin, Base):
    __tablename__ = "rules"
    __table_args__ = (Index("ix_rules_user_position", "user_id", "position"),)

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    stop_processing: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    mailbox_ids: Mapped[list[UUID] | None] = mapped_column(ARRAY(Uuid))
    condition: Mapped[dict[str, Any]] = mapped_column(JSONB)
    actions: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'"))
    match_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_matched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Message(IdMixin, Base):
    """A message that matched at least one rule. Non-matching mail is never stored."""

    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint("mailbox_id", "provider_message_id"),
        Index("ix_messages_user_received", "user_id", text("received_at DESC")),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    mailbox_id: Mapped[UUID] = mapped_column(ForeignKey("mailboxes.id", ondelete="CASCADE"))
    provider_message_id: Mapped[str] = mapped_column(String(255))
    thread_id: Mapped[str | None] = mapped_column(String(255))
    from_address: Mapped[str] = mapped_column(String(320))
    from_name: Mapped[str | None] = mapped_column(String(320))
    to_addresses: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    subject: Mapped[str] = mapped_column(Text, default="")
    snippet: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    list_id: Mapped[str | None] = mapped_column(String(320))
    has_attachments: Mapped[bool] = mapped_column(Boolean, default=False)
    headers: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    web_url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RuleMatch(IdMixin, Base):
    __tablename__ = "rule_matches"
    __table_args__ = (UniqueConstraint("message_id", "rule_id"),)

    message_id: Mapped[UUID] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    rule_id: Mapped[UUID | None] = mapped_column(ForeignKey("rules.id", ondelete="SET NULL"), index=True)
    rule_name: Mapped[str] = mapped_column(String(120))
    matched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(IdMixin, TimestampMixin, Base):
    """Transactional outbox for WhatsApp delivery. The dispatcher is the only sender."""

    __tablename__ = "notifications"
    __table_args__ = (
        Index(
            "ix_notifications_due", "next_attempt_at",
            postgresql_where=text("status IN ('queued', 'failed')"),
        ),
        Index("ix_notifications_user_created", "user_id", text("created_at DESC")),
        Index("ix_notifications_held", "user_id", postgresql_where=text("status = 'held'")),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    destination_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("destinations.id", ondelete="SET NULL")
    )
    chat_id: Mapped[str] = mapped_column(String(128))
    message_id: Mapped[UUID | None] = mapped_column(ForeignKey("messages.id", ondelete="SET NULL"))
    kind: Mapped[NotificationKind] = mapped_column(_enum(NotificationKind))
    # Structured content; rendered to text at send time so alerts can be merged.
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    body: Mapped[str | None] = mapped_column(Text)
    status: Mapped[NotificationStatus] = mapped_column(_enum(NotificationStatus))
    held_reason: Mapped[str | None] = mapped_column(String(32))
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_error: Mapped[str | None] = mapped_column(Text)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), index=True)
    dedupe_key: Mapped[str] = mapped_column(String(64), unique=True)
    parent_id: Mapped[UUID | None] = mapped_column(ForeignKey("notifications.id", ondelete="SET NULL"))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EmailTemplate(IdMixin, TimestampMixin, Base):
    """A reusable email the user fetches on WhatsApp with `/email <name>`."""

    __tablename__ = "email_templates"
    __table_args__ = (
        UniqueConstraint("user_id", "name"),
        Index("uq_email_templates_default", "user_id", unique=True, postgresql_where=text("is_default")),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(40))  # lower-case slug used in `/email <name>`
    description: Mapped[str | None] = mapped_column(String(200))
    mailbox_id: Mapped[UUID | None] = mapped_column(ForeignKey("mailboxes.id", ondelete="SET NULL"))
    to_addresses: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default=text("'{}'"))
    cc_addresses: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default=text("'{}'"))
    bcc_addresses: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default=text("'{}'"))
    subject: Mapped[str] = mapped_column(Text, default="", server_default="")
    body: Mapped[str] = mapped_column(Text, default="", server_default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    use_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class OutboundEmail(IdMixin, TimestampMixin, Base):
    """An email composed on WhatsApp: preview → confirmation → sent through the user's mailbox."""

    __tablename__ = "outbound_emails"
    __table_args__ = (
        Index("ix_outbound_emails_user_created", "user_id", text("created_at DESC")),
        Index("ix_outbound_emails_awaiting", "user_id",
              postgresql_where=text("status = 'awaiting_confirmation'")),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    mailbox_id: Mapped[UUID | None] = mapped_column(ForeignKey("mailboxes.id", ondelete="SET NULL"))
    from_address: Mapped[str] = mapped_column(String(320))
    to_addresses: Mapped[list[str]] = mapped_column(ARRAY(Text))
    cc_addresses: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    bcc_addresses: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    subject: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[OutboundStatus] = mapped_column(_enum(OutboundStatus))
    source: Mapped[str] = mapped_column(String(16), default="whatsapp", server_default="whatsapp")
    chat_id: Mapped[str | None] = mapped_column(String(128))  # where confirmations go
    template_name: Mapped[str | None] = mapped_column(String(40))
    confirm_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_message_id: Mapped[str | None] = mapped_column(String(255))
    error: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OutboundAttachment(IdMixin, Base):
    """A file received on WhatsApp. Staged (email_id NULL) until `/send` claims it."""

    __tablename__ = "outbound_attachments"
    __table_args__ = (Index("ix_outbound_attachments_staged", "user_id", postgresql_where=text("email_id IS NULL")),)

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    email_id: Mapped[UUID | None] = mapped_column(ForeignKey("outbound_emails.id", ondelete="CASCADE"), index=True)
    wa_message_id: Mapped[str] = mapped_column(String(255), unique=True)
    filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(127))
    size: Mapped[int] = mapped_column(Integer)
    # Content is dropped a few days after sending (see cleanup); metadata stays for the log.
    content: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
