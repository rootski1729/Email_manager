"""WhatsApp → email, end to end: webhook payloads in, real SMTP (GreenMail) out, verified over IMAP."""

import json
from uuid import UUID

import pytest
from sqlalchemy import select

from app.core.db import session_factory
from app.core.redis import Keys, get_redis
from app.models import Notification, NotificationKind, OutboundEmail, OutboundStatus
from app.notify import guard
from app.providers.imap import ImapProvider
from app.services import compose
from tests.integration.conftest import sign_in

USER_PHONE = "+14155550123"
USER_CHAT = "14155550123@c.us"
counter = iter(range(1, 10_000))


def wa(body: str = "", *, sender: str = USER_CHAT, from_me: bool = False, to: str = "15550001111@c.us",
       media: dict | None = None) -> dict:
    return {"id": f"false_{sender}_{next(counter):06d}", "from": sender, "to": to, "fromMe": from_me,
            "body": body, "hasMedia": media is not None, "media": media}


async def replies() -> list[str]:
    async with session_factory()() as db:
        rows = (await db.scalars(select(Notification).where(Notification.kind == NotificationKind.reply)
                                 .order_by(Notification.created_at))).all()
    return [r.payload["text"] for r in rows]


async def outbound() -> list[OutboundEmail]:
    async with session_factory()() as db:
        return list((await db.scalars(select(OutboundEmail).order_by(OutboundEmail.created_at))).all())


@pytest.fixture
def sent_ids(monkeypatch):
    ids: list[str] = []

    async def fake_kick(email_id: str) -> None:
        ids.append(email_id)

    monkeypatch.setattr(compose, "kick_send", fake_kick)
    return ids


@pytest.fixture
async def setup(client, sent, infra, sent_ids):
    headers = await sign_in(client, sent, phone=USER_PHONE)
    imap_host, imap_port = infra["imap"]
    smtp_host, smtp_port = infra["smtp"]
    resp = await client.post("/api/v1/mailboxes/imap", headers=headers, json={
        "address": "me@example.com", "credentials": {
            "host": imap_host, "port": imap_port, "security": "plain", "username": "me@example.com",
            "password": "x", "smtp_host": smtp_host, "smtp_port": smtp_port, "smtp_security": "plain"}})
    assert resp.status_code == 201, resp.text
    assert resp.json()["can_send"] is True
    await get_redis().set(Keys.WAHA_HEALTH, json.dumps({"status": "WORKING", "me": "15550001111@c.us"}))
    return headers


async def recipient_inbox(infra, address: str) -> list:
    host, port = infra["imap"]
    creds = {"host": host, "port": port, "security": "plain", "username": address, "password": "x"}
    async with ImapProvider().open(UUID(int=0), address, creds) as session:
        refs = await session.recent(10)
        return [await session.load(r, full=True) for r in refs]


async def test_template_to_sent_email_with_attachment(client, setup, infra, sent_ids, monkeypatch):
    headers = setup
    resp = await client.post("/api/v1/email-templates", headers=headers, json={
        "name": "leave", "description": "Leave request", "to_addresses": ["prof@univ.edu"],
        "subject": "Leave on {{date}}", "body": "Dear Sir,\nI need leave.\n{{name}}"})
    assert resp.status_code == 201, resp.text
    assert resp.json()["is_default"] is True  # first template becomes the default
    preview = (await client.get(f"/api/v1/email-templates/{resp.json()['id']}/preview", headers=headers)).json()
    assert preview["command"] == "/email leave" and preview["form"].startswith("/send\nFrom: me@example.com")

    assert await compose.handle_inbound(wa("/email leave")) == "email"
    instructions, form = (await replies())[-2:]
    assert "Send an email from WhatsApp" in instructions
    assert form.startswith("/send\nFrom: me@example.com\nTo: prof@univ.edu") and "Leave on " in form

    # A file sent during the session becomes an attachment.
    async def fake_download(self, url, max_bytes):
        assert url.endswith("/api/files/scan.pdf")
        return b"%PDF-1.7 fake"

    monkeypatch.setattr("app.notify.waha.WahaClient.download_media", fake_download)
    media = {"url": "http://localhost:3000/api/files/scan.pdf", "mimetype": "application/pdf",
             "filename": "MarkSheet.pdf"}
    await compose.handle_inbound(wa("", media=media))
    assert "Attached *MarkSheet.pdf*" in (await replies())[-1]

    filled = form.replace("To: prof@univ.edu", "To: prof@univ.edu, dean@univ.edu").replace("Cc: ", "Cc: me2@x.org")
    assert await compose.handle_inbound(wa(filled)) == "send"
    preview_text = (await replies())[-1]
    assert "Ready to send" in preview_text and "MarkSheet.pdf" in preview_text and "dean@univ.edu" in preview_text
    assert (await outbound())[0].status == OutboundStatus.awaiting_confirmation

    assert await compose.handle_inbound(wa("yes")) == "confirm"
    assert len(sent_ids) == 1
    assert await compose.send_outbound(UUID(sent_ids[0])) == "sent"
    assert "✅ Sent *Leave on" in (await replies())[-1]

    inbox = await recipient_inbox(infra, "dean@univ.edu")
    assert len(inbox) == 1
    mail = inbox[0]
    assert mail.subject.startswith("Leave on ") and mail.from_address == "me@example.com"
    assert "I need leave." in mail.body_text
    assert [a.name for a in mail.attachments] == ["MarkSheet.pdf"]

    listed = (await client.get("/api/v1/outbound-emails", headers=headers)).json()["items"]
    assert listed[0]["status"] == "sent" and listed[0]["attachments"][0]["filename"] == "MarkSheet.pdf"
    assert listed[0]["template_name"] == "leave"


async def test_strangers_groups_echoes_and_duplicates_are_ignored(client, setup):
    assert await compose.handle_inbound(wa("/email", sender="14155550177@c.us")) == "unknown_sender"
    assert await compose.handle_inbound(wa("/email", sender="1203630@g.us")) == "ignored"
    msg = wa("/help")
    assert await compose.handle_inbound(msg) == "help"
    assert await compose.handle_inbound(msg) == "duplicate"

    # Our own reply echoed back in "Message yourself" must never be executed.
    await guard.remember_text(USER_CHAT, "/send\nTo: x@y.com\nBody:\nhi")
    echo = wa("/send\nTo: x@y.com\nBody:\nhi", sender=USER_CHAT, from_me=True, to=USER_CHAT)
    assert await compose.handle_inbound(echo) == "ignored"
    # fromMe messages in other chats (the operator talking to someone) are ignored too.
    assert await compose.handle_inbound(wa("/email", from_me=True, to="14155550177@c.us")) == "ignored"


async def test_self_chat_commands_work_when_bot_is_the_users_own_phone(client, setup):
    await get_redis().set(Keys.WAHA_HEALTH, json.dumps({"status": "WORKING", "me": USER_CHAT}))
    result = await compose.handle_inbound(wa("/templates", sender=USER_CHAT, from_me=True, to=USER_CHAT))
    assert result == "templates"
    assert "no email templates" in (await replies())[-1]


async def test_validation_cancel_and_disabled(client, setup):
    headers = setup
    await compose.handle_inbound(wa("/send\nFrom: other@gmail.com\nTo: nope\nBody:\nhi"))
    error = (await replies())[-1]
    assert "isn't one of your mailboxes" in error and "'nope' is not a valid email" in error
    assert await outbound() == []

    await compose.handle_inbound(wa("/send\nTo: a@b.com\nSubject: s\nBody:\nhello"))  # single mailbox → From implied
    assert (await outbound())[0].from_address == "me@example.com"
    await compose.handle_inbound(wa("NO"))
    assert (await outbound())[0].status == OutboundStatus.cancelled
    assert await compose.handle_inbound(wa("yes")) == "confirm"
    assert "no email waiting" in (await replies())[-1]

    await client.put("/api/v1/me/settings", headers=headers, json={"compose_enabled": False})
    await compose.handle_inbound(wa("/email"))
    assert "turned off" in (await replies())[-1]


async def test_daily_email_limit(client, setup, sent_ids, monkeypatch):
    from app.core.config import PLANS

    monkeypatch.setattr(PLANS["free"], "daily_emails", 1)
    for i in range(2):
        await compose.handle_inbound(wa(f"/send\nTo: a@b.com\nSubject: n{i}\nBody:\nx"))
        await compose.handle_inbound(wa("yes"))
    assert len(sent_ids) == 1
    assert "today's limit of 1 emails" in (await replies())[-1]


async def test_webhook_enqueues_direct_messages(client, setup, monkeypatch):
    queued: list[dict] = []

    class FakeTask:
        async def kiq(self, payload):
            queued.append(payload)

    monkeypatch.setattr("app.api.routes.webhooks.handle_whatsapp_message", FakeTask())
    payload = {**wa("/help"), "_data": {"huge": "x" * 1000}}
    resp = await client.post("/api/v1/webhooks/waha", json={"event": "message.any", "payload": payload})
    assert resp.status_code == 204
    assert queued and "_data" not in queued[0] and queued[0]["body"] == "/help"


async def test_update_login_keeps_passwords_and_smtp_unless_changed(client, setup, infra):
    headers = setup
    mailbox = (await client.get("/api/v1/mailboxes", headers=headers)).json()[0]
    conn = (await client.get(f"/api/v1/mailboxes/{mailbox['id']}/connection", headers=headers)).json()
    assert conn["smtp_host"] == infra["smtp"][0] and conn["username"] == "me@example.com"
    assert "password" not in conn and "smtp_password" not in conn

    # Same settings, no passwords: the saved ones are kept and sending stays on.
    body = {k: conn[k] for k in ("host", "port", "security", "username", "folder",
                                 "smtp_host", "smtp_port", "smtp_security")}
    url = f"/api/v1/mailboxes/{mailbox['id']}/credentials"
    resp = await client.put(url, headers=headers, json={"credentials": body})
    assert resp.status_code == 200, resp.text
    assert resp.json()["can_send"] is True

    # Explicitly removing SMTP turns sending off.
    resp = await client.put(url, headers=headers, json={"credentials": {**body, "smtp_host": None}})
    assert resp.json()["can_send"] is False
    assert (await client.get(f"/api/v1/mailboxes/{mailbox['id']}/connection", headers=headers)).json()[
        "smtp_host"] is None
