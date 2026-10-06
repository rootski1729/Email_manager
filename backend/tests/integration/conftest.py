import os
import subprocess
from collections.abc import AsyncIterator, Iterator
from typing import Any

import pytest
from asgi_lifespan import LifespanManager
from cryptography.fernet import Fernet
from httpx import ASGITransport, AsyncClient
from testcontainers.core.container import DockerContainer
from testcontainers.core.waiting_utils import wait_for_logs
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

pytestmark = pytest.mark.integration


@pytest.fixture(scope="session")
def infra() -> Iterator[dict[str, Any]]:
    with (
        PostgresContainer("postgres:17-alpine", driver="asyncpg") as pg,
        RedisContainer("redis:8-alpine") as redis,
        DockerContainer("greenmail/standalone:2.1.3")
        .with_env("GREENMAIL_OPTS", "-Dgreenmail.setup.test.all -Dgreenmail.hostname=0.0.0.0 "
                  "-Dgreenmail.auth.disabled -Dgreenmail.verbose")
        .with_exposed_ports(3025, 3143) as mail,
    ):
        wait_for_logs(mail, "Starting GreenMail standalone", timeout=60)
        env = {
            "ENVIRONMENT": "test",
            "DATABASE_URL": pg.get_connection_url(),
            "REDIS_URL": f"redis://{redis.get_container_host_ip()}:{redis.get_exposed_port(6379)}/0",
            "ENCRYPTION_KEYS": Fernet.generate_key().decode(),
            "JWT_SECRET": "test-secret-test-secret-test-secret-123",
            "IMAP_ALLOW_INSECURE": "true",
            "LOG_JSON": "false",
            "LOG_LEVEL": "WARNING",
            "ADMIN_USERNAME": "admin",
            "ADMIN_PASSWORD": "test-admin-password",
            "WAHA_URL": "http://waha.test",
        }
        os.environ.update(env)
        subprocess.run(["alembic", "upgrade", "head"], check=True, env={**os.environ},
                       cwd=os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        from app.core.config import get_settings

        get_settings.cache_clear()
        yield {
            **env,
            "smtp": (mail.get_container_host_ip(), int(mail.get_exposed_port(3025))),
            "imap": (mail.get_container_host_ip(), int(mail.get_exposed_port(3143))),
        }


@pytest.fixture(autouse=True)
async def clean(infra: dict[str, Any]) -> AsyncIterator[None]:
    from sqlalchemy import text

    from app.core.db import get_engine
    from app.core.redis import get_redis

    async with get_engine().begin() as conn:
        await conn.execute(text(
            "TRUNCATE users, refresh_tokens, user_settings, destinations, mailboxes, rules, messages, "
            "rule_matches, notifications, email_templates, outbound_emails, outbound_attachments, events, "
            "admin_accounts, admin_sessions, admin_audit, app_settings CASCADE"))
    await get_redis().flushdb()
    yield


class Sent:
    """Captures WhatsApp messages instead of calling WAHA."""

    def __init__(self) -> None:
        self.messages: list[tuple[str, str]] = []

    async def __call__(self, chat_id: str, text: str) -> str:
        self.messages.append((chat_id, text))
        return f"wamid-{len(self.messages)}"

    def last_code(self) -> str:
        import re

        match = re.search(r"\*(\d{6})\*", self.messages[-1][1])
        assert match, self.messages[-1]
        return match.group(1)


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> Sent:
    capture = Sent()
    monkeypatch.setattr("app.services.auth.send_now", capture)
    monkeypatch.setattr("app.api.routes.destinations.send_now", capture)
    return capture


@pytest.fixture
def kicked(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    calls: list[str] = []

    async def fake_kick(mailbox_id: str) -> None:
        calls.append(mailbox_id)

    monkeypatch.setattr("app.services.ingest.kick_sync", fake_kick)
    monkeypatch.setattr("app.main.kick_sync", fake_kick)
    return calls


@pytest.fixture
async def client(infra: dict[str, Any], kicked: list[str]) -> AsyncIterator[AsyncClient]:
    from app.main import create_app

    app = create_app()
    async with LifespanManager(app), AsyncClient(transport=ASGITransport(app=app),
                                                 base_url="http://test") as http:
        yield http


async def sign_in(client: AsyncClient, sent: Sent, phone: str = "+14155550123") -> dict[str, str]:
    resp = await client.post("/api/v1/auth/otp/request", json={"phone": phone})
    assert resp.status_code == 200, resp.text
    resp = await client.post("/api/v1/auth/otp/verify", json={"phone": phone, "code": sent.last_code()})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}
