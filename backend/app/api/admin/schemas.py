from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.api.schemas import NotificationOut
from app.models import MailboxStatus, Provider
from app.providers.imap import ImapCredentials


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_schema_serialization_defaults_required=True)


# ---- auth ----
class AdminLogin(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class AdminOut(ORM):
    id: UUID
    username: str
    display_name: str | None
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime


class AdminTokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    admin: AdminOut


class AdminCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-z0-9._-]+$")
    display_name: str | None = Field(default=None, max_length=120)
    password: str = Field(min_length=10, max_length=256)


class AdminUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    is_active: bool | None = None


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=10, max_length=256)


# ---- overview ----
class HealthItem(BaseModel):
    key: str
    label: str
    ok: bool
    detail: str


class DayCount(BaseModel):
    date: str
    matched: int
    sent: int
    new_clients: int


class AdminOverview(BaseModel):
    clients: int
    active_clients_7d: int
    new_clients_7d: int
    mailboxes: dict[str, int] = Field(description="by status")
    rules: int
    matched_24h: int
    alerts_sent_24h: int
    alerts_failed_24h: int
    emails_sent_7d: int
    upcoming_events: int
    outbox: dict[str, int] = Field(description="notifications by status")
    health: list[HealthItem]
    whatsapp_status: str
    google_ready: bool
    series: list[DayCount]


# ---- clients ----
class ClientRow(ORM):
    id: UUID
    phone_e164: str
    display_name: str | None
    email: str | None
    plan: str
    is_active: bool
    timezone: str
    created_at: datetime
    last_login_at: datetime | None
    mailboxes: int = 0
    rules: int = 0
    matched_7d: int = 0
    problems: int = Field(default=0, description="mailboxes needing attention")


class ClientPage(BaseModel):
    items: list[ClientRow]
    total: int


class ClientCreate(BaseModel):
    phone: str = Field(min_length=6, max_length=20)
    display_name: str | None = Field(default=None, max_length=120)
    plan: str = "free"


class ClientUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=320)
    timezone: str | None = Field(default=None, max_length=64)
    plan: str | None = None
    is_active: bool | None = None


class AdminMailboxRow(ORM):
    id: UUID
    user_id: UUID
    owner_phone: str | None = None
    owner_name: str | None = None
    provider: Provider
    address: str
    display_name: str | None
    status: MailboxStatus
    can_send: bool
    last_synced_at: datetime | None
    last_error: str | None
    error_count: int
    messages_scanned: int
    created_at: datetime


class AdminRuleRow(ORM):
    id: UUID
    user_id: UUID
    owner_phone: str | None = None
    owner_name: str | None = None
    name: str
    description: str | None
    enabled: bool
    source: str | None
    condition: dict[str, Any]
    actions: dict[str, Any]
    match_count: int
    last_matched_at: datetime | None
    created_at: datetime


class AdminRuleUpdate(BaseModel):
    enabled: bool | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)


class ClientMessageRow(ORM):
    id: UUID
    ref: str | None
    subject: str
    from_address: str
    received_at: datetime


class ClientDetail(BaseModel):
    client: ClientRow
    settings: dict[str, Any]
    mailboxes: list[AdminMailboxRow]
    rules: list[AdminRuleRow]
    destinations: list[dict[str, Any]]
    recent_messages: list[ClientMessageRow]
    recent_notifications: list[NotificationOut]
    notification_counts: dict[str, int]
    emails_sent: int
    upcoming_events: int


class SendToClient(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


# ---- configuration ----
class GoogleConfigOut(BaseModel):
    client_id: str
    client_secret_set: bool
    project_id: str
    pubsub_topic: str
    pubsub_subscription: str
    push_mode: Literal["pull", "push"]
    push_audience: str
    push_service_account: str
    source: Literal["database", "environment"]
    oauth_ready: bool
    push_ready: bool
    redirect_uri: str = Field(description="Add this as an Authorized redirect URI in Google Cloud")
    javascript_origin: str
    listener_online: bool


class GoogleConfigIn(BaseModel):
    client_id: str = Field(default="", max_length=255)
    client_secret: str | None = Field(default=None, max_length=255, description="null or empty keeps the saved one")
    project_id: str = Field(default="", max_length=100)
    pubsub_topic: str = Field(default="gmail-notifications", max_length=255)
    pubsub_subscription: str = Field(default="gmail-notifications-sub", max_length=255)
    push_mode: Literal["pull", "push"] = "pull"
    push_audience: str = Field(default="", max_length=500)
    push_service_account: str = Field(default="", max_length=320)


class CheckResult(BaseModel):
    ok: bool
    title: str
    detail: str


# ---- tools ----
class ToolRuleTest(BaseModel):
    condition: dict[str, Any]
    from_address: str = "someone@example.com"
    from_name: str = ""
    to: list[str] = Field(default_factory=list)
    subject: str = ""
    body: str = ""
    headers: dict[str, str] = Field(default_factory=dict)
    attachment_names: list[str] = Field(default_factory=list)


class ToolRuleResult(BaseModel):
    matched: bool
    explanation: list[str] = Field(description="Which conditions passed or failed, in plain words")


class ToolDates(BaseModel):
    subject: str = Field(default="", max_length=500)
    body: str = Field(default="", max_length=20_000)
    timezone: str = "Asia/Kolkata"
    received_at: datetime | None = None


class ToolDateFound(BaseModel):
    kind: str
    title: str
    starts_at: datetime
    all_day: bool
    confidence: float
    status: str
    context: str | None


class ToolWhatsApp(BaseModel):
    phone: str = Field(min_length=6, max_length=20)
    text: str = Field(min_length=1, max_length=2000)


class ToolMailbox(BaseModel):
    address: str = Field(min_length=3, max_length=320)
    credentials: ImapCredentials


# ---- database ----
class DbColumn(BaseModel):
    name: str
    type: str
    nullable: bool
    editable: bool
    hidden: bool = Field(description="Secret: never shown or exported")
    primary_key: bool


class DbTable(BaseModel):
    name: str
    label: str
    description: str
    rows: int
    columns: list[DbColumn]
    can_delete: bool
    can_edit: bool


class DbRows(BaseModel):
    table: str
    total: int
    rows: list[dict[str, Any]]


class AuditRow(ORM):
    id: UUID
    admin_username: str
    action: str
    target_type: str | None
    target_id: str | None
    details: dict[str, Any]
    ip: str | None
    created_at: datetime


class AIConfigOut(BaseModel):
    endpoint: str
    model: str
    enabled: bool
    api_key_set: bool
    ready: bool
    source: Literal["database", "environment"]


class AIConfigIn(BaseModel):
    endpoint: str = Field(default="", max_length=500, description="Azure AI Foundry / Azure OpenAI endpoint URL")
    model: str = Field(default="", max_length=200, description="The deployment name, e.g. gpt-4.1-mini")
    enabled: bool = True
    api_key: str | None = Field(default=None, max_length=500, description="null or empty keeps the saved key")
