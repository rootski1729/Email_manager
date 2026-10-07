from functools import lru_cache
from typing import Annotated, Literal

from pydantic import BaseModel, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class PlanLimits(BaseModel):
    mailboxes: int
    rules: int
    daily_alerts: int
    daily_emails: int
    templates: int


PLANS: dict[str, PlanLimits] = {
    "free": PlanLimits(mailboxes=3, rules=10, daily_alerts=50, daily_emails=20, templates=10),
    "pro": PlanLimits(mailboxes=20, rules=200, daily_alerts=500, daily_emails=200, templates=100),
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    log_json: bool = True

    # Public URLs: the web app (for links in WhatsApp messages) and the API (for OAuth/webhooks).
    public_web_url: str = "http://localhost:3000"
    public_api_url: str = "http://localhost:8000"
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:3000"])

    database_url: str = "postgresql+asyncpg://mailsentinel:mailsentinel@localhost:5432/mailsentinel"
    database_pool_size: int = 10
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_secret: SecretStr = SecretStr("dev-only-change-me-dev-only-change-me")
    access_token_ttl_s: int = 15 * 60
    refresh_token_ttl_s: int = 30 * 24 * 3600
    otp_ttl_s: int = 300
    otp_max_attempts: int = 5
    otp_requests_per_window: int = 3
    otp_request_window_s: int = 15 * 60
    turnstile_secret: SecretStr | None = None
    # First admin account, created on startup when no admin exists yet (then change the password in the console).
    admin_username: str = ""
    admin_password: SecretStr = SecretStr("")
    admin_access_ttl_s: int = 30 * 60
    admin_session_ttl_s: int = 12 * 3600

    # Comma separated Fernet keys; first one encrypts, all of them decrypt (rotation).
    encryption_keys: Annotated[list[str], NoDecode] = Field(default_factory=list)

    # Google / Gmail
    google_client_id: str = ""
    google_client_secret: SecretStr = SecretStr("")
    google_project_id: str = ""
    google_pubsub_topic: str = "gmail-notifications"
    google_pubsub_subscription: str = "gmail-notifications-sub"
    gmail_push_mode: Literal["pull", "push"] = "pull"
    gmail_push_audience: str = ""
    gmail_push_service_account: str = ""

    # IMAP
    imap_allow_insecure: bool = False
    imap_timeout_s: int = 30

    # WAHA
    waha_url: str = "http://localhost:3000"
    waha_api_key: SecretStr = SecretStr("")
    waha_session: str = "default"
    waha_webhook_hmac_key: SecretStr = SecretStr("")
    # Log messages instead of sending them (local development without a paired phone).
    waha_dry_run: bool = False

    # Delivery limits
    rate_global_per_min: int = 20
    rate_global_burst: int = 5
    rate_destination_per_min: int = 6
    coalesce_window_s: int = 8
    max_delivery_attempts: int = 6
    send_jitter_ms: tuple[int, int] = (800, 2500)

    snippet_chars: int = 300
    alert_preview_chars: int = 600

    # AI (Azure AI Foundry / Azure OpenAI, OpenAI-compatible v1 API). Usually set in the admin console instead.
    ai_endpoint: str = ""
    ai_api_key: SecretStr = SecretStr("")
    ai_model: str = ""
    ai_enabled: bool = True
    ai_timeout_s: float = 25.0

    # Sending email from WhatsApp (/email)
    compose_session_ttl_s: int = 30 * 60
    compose_confirm_ttl_s: int = 10 * 60
    compose_max_recipients: int = 50
    compose_max_attachments: int = 10
    compose_max_file_bytes: int = 16 * 1024 * 1024
    # Raw bytes; base64 adds ~33%, keeping the message under Gmail's 25 MB limit.
    compose_max_total_bytes: int = 18 * 1024 * 1024
    smtp_timeout_s: int = 30

    @field_validator("cors_origins", "encryption_keys", mode="before")
    @classmethod
    def _split_csv(cls, v: object) -> object:
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def cookie_secure(self) -> bool:
        """HTTPS-only cookies whenever the site is served over HTTPS (a VM reached by plain http://IP still works)."""
        return self.public_web_url.startswith("https://")

    @property
    def google_oauth_redirect_uri(self) -> str:
        return f"{self.public_api_url.rstrip('/')}/api/v1/oauth/google/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()
