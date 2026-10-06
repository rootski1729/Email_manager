"""Request/response models. These define the OpenAPI contract the frontend client is generated from."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import (
    DestinationKind,
    MailboxStatus,
    NotificationKind,
    NotificationStatus,
    OutboundStatus,
    Provider,
    Role,
)
from app.providers.imap import ImapCredentials
from app.rules.schema import MAX_DEPTH, MAX_NODES, Actions, Condition, measure
from app.services.schedule import tz


class ORM(BaseModel):
    # Fields with defaults are always present in responses, so mark them required in the OpenAPI output.
    model_config = ConfigDict(from_attributes=True, json_schema_serialization_defaults_required=True)


class Page[T](BaseModel):
    items: list[T]
    next_cursor: str | None = None


# ---- auth ----
class OtpRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=24, examples=["+919876543210"])
    turnstile_token: str | None = None


class OtpRequested(BaseModel):
    phone: str
    expires_in: int


class OtpVerify(BaseModel):
    phone: str = Field(min_length=6, max_length=24)
    code: str = Field(pattern=r"^\s*\d{6}\s*$")


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


# ---- users ----
class UserOut(ORM):
    id: UUID
    phone_e164: str
    display_name: str | None
    email: str | None
    timezone: str
    role: Role
    plan: str
    created_at: datetime


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=320)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str | None) -> str | None:
        if v is not None and tz(v).key != v:
            raise ValueError("unknown timezone")
        return v


class QuietHours(BaseModel):
    enabled: bool = False
    start: str = Field(default="23:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(default="07:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class DigestSettings(BaseModel):
    enabled: bool = False
    time: str = Field(default="08:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class SettingsOut(BaseModel):
    quiet_hours: QuietHours
    digest: DigestSettings
    daily_cap: int | None
    compose_enabled: bool = Field(description="Allow sending email from WhatsApp with /email")
    plan_limits: dict[str, int] = Field(description="mailboxes, rules, daily_alerts, daily_emails, templates")


class SettingsUpdate(BaseModel):
    quiet_hours: QuietHours | None = None
    digest: DigestSettings | None = None
    daily_cap: int | None = Field(default=None, ge=1, le=10_000)
    compose_enabled: bool | None = None


# ---- destinations ----
class DestinationOut(ORM):
    id: UUID
    kind: DestinationKind
    chat_id: str
    label: str
    verified_at: datetime | None
    is_default: bool
    created_at: datetime


class DestinationCreate(BaseModel):
    phone: str = Field(min_length=6, max_length=24)
    label: str = Field(min_length=1, max_length=120)


class DestinationUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    is_default: bool | None = None


class DestinationVerify(BaseModel):
    code: str = Field(pattern=r"^\s*\d{6}\s*$")


class GroupLinkOut(BaseModel):
    code: str
    expires_in: int
    instructions: str
    bot_number: str | None


# ---- mailboxes ----
class MailboxOut(ORM):
    id: UUID
    provider: Provider
    address: str
    display_name: str | None
    status: MailboxStatus
    watch_expires_at: datetime | None
    last_synced_at: datetime | None
    last_error: str | None
    error_count: int
    messages_scanned: int
    can_send: bool = Field(description="Can send email (Gmail send permission or SMTP configured)")
    created_at: datetime


class ImapMailboxCreate(BaseModel):
    address: str = Field(min_length=3, max_length=320)
    display_name: str | None = Field(default=None, max_length=120)
    preset: str | None = Field(default=None, description="outlook, yahoo, zoho, icloud, gmail-imap")
    credentials: ImapCredentials


class MailboxUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    paused: bool | None = None


class AuthorizeOut(BaseModel):
    url: str


class ImapPreset(BaseModel):
    id: str
    host: str
    port: int
    security: str
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_security: str | None = None


# ---- rules ----
def check_condition_size(cond: Condition | None) -> Condition | None:
    if cond is not None:
        depth, nodes = measure(cond)
        if depth > MAX_DEPTH:
            raise ValueError(f"conditions can be nested at most {MAX_DEPTH} levels deep")
        if nodes > MAX_NODES:
            raise ValueError(f"a rule can have at most {MAX_NODES} conditions")
    return cond


def dump_condition(cond: Condition) -> dict[str, Any]:
    return cond.model_dump(mode="json", by_alias=True, exclude_none=True)


class RuleBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    enabled: bool = True
    stop_processing: bool = False
    mailbox_ids: list[UUID] | None = Field(default=None, description="null = all mailboxes")
    condition: Condition = Field(description="Condition tree: {all|any:[...]}, {not:{...}} or a predicate")
    actions: Actions = Field(default_factory=Actions)

    _size = field_validator("condition")(check_condition_size)


class RuleCreate(RuleBase):
    pass


class RuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    enabled: bool | None = None
    stop_processing: bool | None = None
    mailbox_ids: list[UUID] | None = None
    condition: Condition | None = None
    actions: Actions | None = None

    _size = field_validator("condition")(check_condition_size)


class RuleOut(ORM):
    id: UUID
    name: str
    description: str | None
    enabled: bool
    position: int
    stop_processing: bool
    mailbox_ids: list[UUID] | None
    condition: Condition
    actions: Actions
    match_count: int
    last_matched_at: datetime | None
    created_at: datetime
    updated_at: datetime


class RuleOrder(BaseModel):
    ids: list[UUID] = Field(min_length=1, max_length=1000)


class SampleEmail(BaseModel):
    from_address: str = ""
    from_name: str = ""
    to: list[str] = Field(default_factory=list)
    subject: str = ""
    body: str = ""
    headers: dict[str, str] = Field(default_factory=dict)
    attachment_names: list[str] = Field(default_factory=list)


class RuleTest(BaseModel):
    condition: Condition
    mailbox_id: UUID | None = None
    sample: SampleEmail | None = None
    limit: int = Field(default=20, ge=1, le=50)

    _size = field_validator("condition")(check_condition_size)


class RuleTestHit(BaseModel):
    matched: bool
    subject: str
    from_address: str
    from_name: str
    received_at: datetime | None
    snippet: str


class RuleTestOut(BaseModel):
    tested: int
    matched: int
    results: list[RuleTestHit]


class FieldInfo(BaseModel):
    field: str
    label: str
    ops: list[str]
    needs_full_message: bool


# ---- messages & notifications ----
class MatchOut(ORM):
    rule_id: UUID | None
    rule_name: str
    matched_at: datetime


class MessageOut(ORM):
    id: UUID
    mailbox_id: UUID
    mailbox_address: str | None = None
    from_address: str
    from_name: str | None
    subject: str
    snippet: str | None
    received_at: datetime
    has_attachments: bool
    web_url: str | None
    rules: list[str] = Field(default_factory=list)


class NotificationOut(ORM):
    id: UUID
    kind: NotificationKind
    status: NotificationStatus
    chat_id: str
    destination_id: UUID | None
    message_id: UUID | None
    held_reason: str | None
    attempts: int
    next_attempt_at: datetime
    last_error: str | None
    body: str | None
    preview: str | None = None
    subject: str | None = Field(default=None, description="Email subject (alerts) or digest title")
    created_at: datetime
    sent_at: datetime | None


class MessageDetail(MessageOut):
    to_addresses: list[str]
    list_id: str | None
    thread_id: str | None
    matches: list[MatchOut]
    notifications: list[NotificationOut]


# ---- stats & admin ----
class DayStat(BaseModel):
    date: str
    scanned: int
    matched: int
    sent: int
    failed: int


class Overview(BaseModel):
    mailboxes: dict[str, int]
    rules_enabled: int
    rules_total: int
    matched_today: int
    matched_7d: int
    notifications_24h: dict[str, int]
    delivery_rate_7d: float | None
    queue_depth: int
    waha: dict[str, Any]
    series: list[DayStat]


class WahaSession(BaseModel):
    status: str = Field(description="WORKING, SCAN_QR_CODE, STARTING, STOPPED, FAILED, MISSING, UNREACHABLE")
    me: str | None = Field(default=None, description="Paired WhatsApp id, e.g. 919876543210@c.us")
    detail: str | None = None
    dry_run: bool = False
    qr: str | None = Field(default=None, description="data: URL of the pairing QR when status is SCAN_QR_CODE")


class ComponentHealth(BaseModel):
    name: str
    ok: bool
    detail: str | None = None


class QueueStats(BaseModel):
    outbox: dict[str, int]
    task_backlog: int = Field(description="Background tasks waiting for a worker (consumer-group lag)")
    task_pending: int
    global_tokens: float
    components: list[ComponentHealth]
    dead_letters: list[NotificationOut]


class SyncQueued(BaseModel):
    queued: bool = Field(description="false when a sync for this mailbox is already pending")


class ImapCredentialsPatch(BaseModel):
    """Like ImapCredentials, but blank passwords keep the saved ones. smtp_host null turns sending off."""

    host: str = Field(min_length=1, max_length=255)
    port: int = Field(default=993, ge=1, le=65535)
    security: Literal["ssl", "plain"] = "ssl"
    username: str = Field(min_length=1, max_length=320)
    password: str | None = Field(default=None, max_length=1024, description="null/empty = keep the saved one")
    folder: str = Field(default="INBOX", max_length=255)
    smtp_host: str | None = Field(default=None, max_length=255, description="null = no sending")
    smtp_port: int = Field(default=465, ge=1, le=65535)
    smtp_security: Literal["ssl", "starttls", "plain"] = "ssl"
    smtp_username: str | None = Field(default=None, max_length=320)
    smtp_password: str | None = Field(default=None, max_length=1024, description="null/empty = keep the saved one")


class ImapCredentialsUpdate(BaseModel):
    credentials: ImapCredentialsPatch


class ImapConnectionOut(BaseModel):
    """Current IMAP/SMTP settings of a mailbox, without passwords (to prefill the edit form)."""

    host: str
    port: int
    security: str
    username: str
    folder: str
    smtp_host: str | None
    smtp_port: int
    smtp_security: str
    smtp_username: str | None
    has_smtp_password: bool


class Problem(BaseModel):
    """RFC 9457 error body returned for every non-2xx response."""

    type: str
    title: str
    status: int
    detail: str
    code: str = Field(description="Stable machine-readable error code, e.g. plan_limit, invalid_code")
    errors: list[dict[str, Any]] | None = Field(default=None, description="Validation errors: [{loc, msg}]")
    retry_after: int | None = None


# ---- email templates & WhatsApp-composed emails ----
def normalize_emails(values: list[str] | None) -> list[str] | None:
    if values is None:
        return None
    out: list[str] = []
    for raw in values:
        raw = raw.strip()
        if not raw:
            continue
        try:
            address = validate_email(raw, check_deliverability=False).normalized
        except EmailNotValidError as exc:
            raise ValueError(f"'{raw}' is not a valid email address") from exc
        if address.lower() not in (a.lower() for a in out):
            out.append(address)
    return out


class EmailTemplateBase(BaseModel):
    description: str | None = Field(default=None, max_length=200)
    mailbox_id: UUID | None = Field(default=None, description="Mailbox to send from; null = first that can send")
    to_addresses: list[str] = Field(default_factory=list, max_length=50)
    cc_addresses: list[str] = Field(default_factory=list, max_length=50)
    bcc_addresses: list[str] = Field(default_factory=list, max_length=50)
    subject: str = Field(default="", max_length=500)
    body: str = Field(default="", max_length=20_000, description="Supports {{date}}, {{time}} and {{name}}")
    is_default: bool = Field(default=False, description="Used by a plain /email")

    _emails = field_validator("to_addresses", "cc_addresses", "bcc_addresses")(
        classmethod(lambda cls, v: normalize_emails(v)))


class EmailTemplateCreate(EmailTemplateBase):
    name: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9][a-z0-9_-]*$",
                      description="Lower-case name used in WhatsApp: /email <name>")


class EmailTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40, pattern=r"^[a-z0-9][a-z0-9_-]*$")
    description: str | None = Field(default=None, max_length=200)
    mailbox_id: UUID | None = None
    to_addresses: list[str] | None = Field(default=None, max_length=50)
    cc_addresses: list[str] | None = Field(default=None, max_length=50)
    bcc_addresses: list[str] | None = Field(default=None, max_length=50)
    subject: str | None = Field(default=None, max_length=500)
    body: str | None = Field(default=None, max_length=20_000)
    is_default: bool | None = None

    _emails = field_validator("to_addresses", "cc_addresses", "bcc_addresses")(
        classmethod(lambda cls, v: normalize_emails(v)))


class EmailTemplateOut(ORM):
    id: UUID
    name: str
    description: str | None
    mailbox_id: UUID | None
    to_addresses: list[str]
    cc_addresses: list[str]
    bcc_addresses: list[str]
    subject: str
    body: str
    is_default: bool
    use_count: int
    created_at: datetime
    updated_at: datetime


class TemplatePreview(BaseModel):
    command: str = Field(description="What to send on WhatsApp, e.g. /email leave")
    instructions: str
    form: str = Field(description="The copyable form the bot replies with")


class AttachmentOut(ORM):
    id: UUID
    filename: str
    mime_type: str
    size: int


class OutboundEmailOut(ORM):
    id: UUID
    mailbox_id: UUID | None
    from_address: str
    to_addresses: list[str]
    cc_addresses: list[str]
    bcc_addresses: list[str]
    subject: str
    status: OutboundStatus
    source: str
    template_name: str | None
    error: str | None
    attachments: list[AttachmentOut] = Field(default_factory=list)
    confirm_expires_at: datetime | None
    created_at: datetime
    sent_at: datetime | None


class OutboundEmailDetail(OutboundEmailOut):
    body: str
    provider_message_id: str | None
