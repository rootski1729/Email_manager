"""Request/response models. These define the OpenAPI contract the frontend client is generated from."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import (
    DestinationKind,
    EventKind,
    EventStatus,
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
    muted_senders: list[str] = Field(description="Addresses or domains that never trigger WhatsApp alerts")
    weekly_recap: bool = Field(description="Sunday-evening summary on WhatsApp")
    deadlines_enabled: bool = Field(description="Find exam dates, interviews and due dates and remind before them")
    ai_enabled: bool = Field(description="AI summaries in alerts, reply suggestions and drafting")
    plan_limits: dict[str, int] = Field(description="mailboxes, rules, daily_alerts, daily_emails, templates")


class SettingsUpdate(BaseModel):
    quiet_hours: QuietHours | None = None
    digest: DigestSettings | None = None
    daily_cap: int | None = Field(default=None, ge=1, le=10_000)
    compose_enabled: bool | None = None
    muted_senders: list[str] | None = Field(default=None, max_length=200)
    weekly_recap: bool | None = None
    deadlines_enabled: bool | None = None
    ai_enabled: bool | None = None

    @field_validator("muted_senders")
    @classmethod
    def _muted(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out: list[str] = []
        for raw in v:
            item = raw.strip().lower().strip("<>").removeprefix("@")
            if not item:
                continue
            if "." not in item.rsplit("@", 1)[-1] or " " in item or len(item) > 320:
                raise ValueError(f"'{raw}' is not an email address or domain")
            if item not in out:
                out.append(item)
        return out


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
    source: str | None = None


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
    ref: str | None = Field(default=None, description="Short code used in WhatsApp, e.g. K7 for /open K7")
    ai_summary: str | None = None
    ai_action: str | None = None
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


class ThreadMessageOut(BaseModel):
    sender: str = Field(description="Who wrote it (name or address), as quoted in the email")
    sent: str = Field(description="When, as the email client wrote it")
    text: str


class EmailFileOut(BaseModel):
    index: int = Field(description="Use with GET /messages/{id}/attachments/{index}")
    name: str
    mime_type: str
    size: int


class MessageContent(BaseModel):
    """The whole email, read live from the mailbox: what's new in it, the earlier thread and the files."""

    kind: Literal["new", "reply", "forward"]
    subject: str
    from_name: str
    from_address: str
    to: list[str]
    cc: list[str]
    received_at: datetime
    text: str = Field(description="What the sender wrote in this email (for a forward: the forwarded email)")
    note: str | None = Field(default=None, description="Forwards: the note the forwarder added")
    forwarded_from: str | None = None
    forwarded_subject: str | None = None
    thread: list[ThreadMessageOut] = Field(description="Earlier messages in the thread, newest first")
    attachments: list[EmailFileOut]
    web_url: str | None = None


class ReplyIdeasRequest(BaseModel):
    guidance: str | None = Field(default=None, max_length=500,
                                 description="Optional: what the replies should do, e.g. 'politely decline'")


class MessageDetail(MessageOut):
    to_addresses: list[str]
    list_id: str | None
    thread_id: str | None
    matches: list[MatchOut]
    notifications: list[NotificationOut]
    events: list["EventOut"] = Field(default_factory=list)


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


# ---- deadline radar ----
class EventOut(ORM):
    id: UUID
    message_id: UUID | None
    source: str = Field(description="ics (calendar invite), text (found in the email) or manual")
    kind: EventKind
    title: str
    context: str | None = Field(description="The sentence the date was found in")
    starts_at: datetime
    ends_at: datetime | None
    all_day: bool
    location: str | None
    confidence: float
    status: EventStatus
    message_subject: str | None = None
    message_ref: str | None = None
    created_at: datetime


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    kind: EventKind = EventKind.other
    starts_at: datetime
    ends_at: datetime | None = None
    all_day: bool = False
    location: str | None = Field(default=None, max_length=300)
    message_id: UUID | None = None

    @model_validator(mode="after")
    def _order(self) -> "EventCreate":
        if self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    kind: EventKind | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    all_day: bool | None = None
    location: str | None = Field(default=None, max_length=300)
    status: EventStatus | None = Field(default=None, description="suggested → upcoming confirms; dismissed hides")


class CalendarFeedOut(BaseModel):
    url: str = Field(description="Private iCalendar feed; subscribe to it in Google or Apple Calendar")
    webcal_url: str


class RemindRequest(BaseModel):
    at: datetime | None = Field(default=None, description="Exact time; or use `when`")
    when: str | None = Field(default=None, max_length=60, description="'2h', 'tomorrow 9am', 'mon 8:30'")


class RemindOut(BaseModel):
    at: datetime
    description: str


class MuteRequest(BaseModel):
    scope: Literal["address", "domain"] = "address"


class MuteOut(BaseModel):
    muted: str
    muted_senders: list[str]


# ---- starter packs, suggestions, onboarding ----
class RulePackOut(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    urgent: bool
    condition: dict[str, Any]
    installed: bool = Field(description="A rule created from this pack already exists")


class PackSuggestion(BaseModel):
    pack: RulePackOut
    count: int = Field(description="Recent emails this pack would have caught")
    examples: list[str]


class SenderSuggestionOut(BaseModel):
    domain: str
    count: int
    examples: list[str]
    names: list[str]


class SuggestionsOut(BaseModel):
    mailbox_id: UUID
    scanned: int
    packs: list[PackSuggestion]
    senders: list[SenderSuggestionOut]


class InstallPack(BaseModel):
    mailbox_ids: list[UUID] | None = None


class SenderRuleCreate(BaseModel):
    domain: str = Field(min_length=3, max_length=253)
    name: str | None = Field(default=None, max_length=120)
    urgent: bool = False


class OnboardingStep(BaseModel):
    id: str
    title: str
    description: str
    done: bool
    href: str


class OnboardingOut(BaseModel):
    steps: list[OnboardingStep]
    completed: int
    total: int
    dismissed: bool


class TestAlertOut(BaseModel):
    queued: bool
    chat_id: str


MessageDetail.model_rebuild()


# ---- AI assistant ----
class AIStatus(BaseModel):
    available: bool = Field(description="AI is set up by the admin and switched on for you")
    configured: bool = Field(description="The admin has set up AI for this installation")
    enabled_for_me: bool


class ReplyIdeaOut(BaseModel):
    label: str
    instruction: str


class DraftRequest(BaseModel):
    instructions: str = Field(min_length=1, max_length=2000, description="What the email should say")


class ReviseRequest(BaseModel):
    instructions: str = Field(min_length=1, max_length=2000)
    to: list[str] = Field(default_factory=list, max_length=50)
    cc: list[str] = Field(default_factory=list, max_length=50)
    subject: str = Field(default="", max_length=500)
    body: str = Field(default="", max_length=20_000)
    reply_to_message_id: UUID | None = None


class DraftOut(BaseModel):
    mailbox_id: UUID
    from_address: str
    to: list[str]
    cc: list[str]
    subject: str
    body: str
    reply_to_message_id: UUID | None = None


class RuleFromText(BaseModel):
    description: str = Field(min_length=3, max_length=1000, description="e.g. 'anything from my college about exams'")


class RuleIdeaOut(BaseModel):
    name: str
    condition: dict[str, Any]
    explanation: str


class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=2000)


class EmailAskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    history: list[ChatTurn] = Field(default_factory=list, max_length=12,
                                    description="Earlier questions and answers about this email, oldest first")


class EmailAskOut(BaseModel):
    answer: str


class AskRef(BaseModel):
    message_id: UUID
    ref: str | None
    subject: str


class AskOut(BaseModel):
    answer: str
    refs: list[AskRef]


class OutboundCreate(BaseModel):
    """Send an email from the website (you already confirmed it by pressing Send)."""

    mailbox_id: UUID
    to: list[str] = Field(min_length=1, max_length=50)
    cc: list[str] = Field(default_factory=list, max_length=50)
    bcc: list[str] = Field(default_factory=list, max_length=50)
    subject: str = Field(default="", max_length=500)
    body: str = Field(min_length=1, max_length=50_000)
    reply_to_message_id: UUID | None = None

    _emails = field_validator("to", "cc", "bcc")(classmethod(lambda cls, v: normalize_emails(v)))
