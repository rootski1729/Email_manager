"""The AI assistant end to end with a fake model: admin setup, alert summaries, WhatsApp replies and the website."""

from typing import Any
from uuid import UUID

import pytest
from sqlalchemy import select

from app.ai import features
from app.core.db import session_factory
from app.models import AdminAudit, AppSetting, Message, Notification, NotificationKind, OutboundEmail, OutboundStatus
from app.services import compose, ingest
from tests.integration.test_admin import admin_headers
from tests.integration.test_compose import recipient_inbox
from tests.integration.test_engagement import last_reply, mail, no_delay, ready, wa  # noqa: F401  (fixtures)

KEY = "test-ai-key-value-123"


class FakeModel:
    """Answers each kind of prompt the way a well-behaved model would, and records what it was asked."""

    def __init__(self) -> None:
        self.prompts: list[str] = []

    async def __call__(self, messages: list[dict[str, str]], *, max_tokens: int = 700) -> dict[str, Any]:
        system, last = messages[0]["content"], messages[-1]["content"]
        self.prompts.append(system)
        if "summarise one email" in system:
            return {"summary": "The viva is on 20 Oct at 11 AM in Lab 3.", "action": "Confirm your slot by Friday.",
                    "importance": "high"}
        if "Suggest exactly 3" in system:
            if "politely decline" in system:
                return {"replies": [{"label": "Decline kindly", "instruction": "Decline the viva slot politely"},
                                    {"label": "Decline and thank", "instruction": "Thank them and decline"},
                                    {"label": "Decline, offer later", "instruction": "Decline and offer later"}]}
            return {"replies": [{"label": "Confirm slot", "instruction": "Confirm the 11 AM slot"},
                                {"label": "Ask to move", "instruction": "Ask for an afternoon slot"},
                                {"label": "Ask venue", "instruction": "Ask which building Lab 3 is in"}]}
        if "Write an email reply" in system:
            body = "Dear Sir,\n\nCould I move my viva to the afternoon?\n\nAsha"
            if "shorter" in last:
                body = "Sir, may I have an afternoon viva slot?\n\nAsha"
            elif "travelling" in last:
                body = "Dear Sir,\n\nCould I move my viva to the afternoon? I'm travelling in the morning.\n\nAsha"
            return {"subject": "Re: Project viva slot", "body": body}
        if "Write a new email" in system:
            to = ["office@univ.edu"] if "office@univ.edu" in last else []
            return {"to": to, "cc": [], "subject": "Leave tomorrow", "body": "Dear Sir,\n\nI need leave.\n\nAsha"}
        if "into a rule" in system:
            return {"name": "College exams", "explanation": "Mail from univ.edu about exams",
                    "condition": {"all": [{"field": "from.domain", "op": "domain_matches", "value": ["univ.edu"]},
                                          {"field": "subject", "op": "contains", "value": ["exam", "viva"]}]}}
        if "Answer the user's question" in system:
            ref = last.split("#", 1)[1].split(" ", 1)[0]
            return {"answer": "Your viva is on 20 Oct at 11 AM.", "refs": [ref]}
        raise AssertionError(system)


@pytest.fixture
def model(monkeypatch) -> FakeModel:
    fake = FakeModel()
    monkeypatch.setattr(features, "complete_json", fake)
    return fake


@pytest.fixture
def queued(monkeypatch) -> list[str]:
    ids: list[str] = []

    async def fake_kick(email_id: str) -> None:
        ids.append(email_id)

    monkeypatch.setattr(compose, "kick_send", fake_kick)
    return ids


@pytest.fixture
async def setup(client, ready, infra, model, queued):  # noqa: F811
    headers, mailbox_id = ready
    smtp_host, smtp_port = infra["smtp"]
    imap_host, imap_port = infra["imap"]
    resp = await client.put(f"/api/v1/mailboxes/{mailbox_id}/credentials", headers=headers, json={"credentials": {
        "host": imap_host, "port": imap_port, "security": "plain", "username": "student@example.com",
        "password": "secret", "smtp_host": smtp_host, "smtp_port": smtp_port, "smtp_security": "plain"}})
    assert resp.status_code == 200, resp.text
    await client.patch("/api/v1/me", headers=headers, json={"display_name": "Asha"})
    return headers, mailbox_id


async def test_admin_sets_up_ai_without_exposing_the_key(client, model):
    admin = await admin_headers(client)
    before = (await client.get("/api/v1/admin/config/ai", headers=admin)).json()
    assert before["ready"] is False and before["api_key_set"] is False
    check = (await client.post("/api/v1/admin/config/ai/check", headers=admin)).json()
    assert check[0]["ok"] is False and "Missing" in check[0]["detail"]

    resp = await client.put("/api/v1/admin/config/ai", headers=admin, json={
        "endpoint": "https://me.openai.azure.com/", "model": "gpt-4.1-mini", "api_key": KEY})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"endpoint": "https://me.openai.azure.com/", "model": "gpt-4.1-mini", "enabled": True,
                           "api_key_set": True, "ready": True, "source": "database"}
    # A save without a key keeps the saved key.
    kept = (await client.put("/api/v1/admin/config/ai", headers=admin, json={
        "endpoint": "https://me.openai.azure.com/", "model": "gpt-4.1"})).json()
    assert kept["api_key_set"] is True and kept["model"] == "gpt-4.1"

    check = (await client.post("/api/v1/admin/config/ai/check", headers=admin)).json()
    assert [c["ok"] for c in check] == [True, True]
    assert check[0]["detail"] == "https://me.openai.azure.com/openai/v1" and "viva" in check[1]["detail"]
    health = {h["key"]: h for h in (await client.get("/api/v1/admin/health", headers=admin)).json()}
    assert health["ai"]["ok"] is True

    async with session_factory()() as db:
        row = await db.scalar(select(AppSetting).where(AppSetting.key == "ai"))
        audits = (await db.scalars(select(AdminAudit))).all()
    assert KEY not in str(row.value) and KEY.encode() not in (row.secret or b"")
    assert all(KEY not in str(a.details) for a in audits)

    off = (await client.delete("/api/v1/admin/config/ai", headers=admin)).json()
    assert off["ready"] is False


async def enable_ai(client) -> None:
    admin = await admin_headers(client)
    resp = await client.put("/api/v1/admin/config/ai", headers=admin, json={
        "endpoint": "https://me.openai.azure.com", "model": "gpt-4.1-mini", "api_key": KEY})
    assert resp.status_code == 200, resp.text


async def test_whatsapp_alert_summary_reply_pick_edit_and_send(client, setup, infra, model, queued):
    _, mailbox_id = setup
    await enable_ai(client)
    mail(infra, "student@example.com", "Project viva slot",
         "Dear student,\n\nYour project viva is on 20 October at 11 AM in Lab 3. Confirm by Friday.\n\nRegards,\nHOD")
    await ingest.sync_mailbox(mailbox_id)

    async with session_factory()() as db:
        message = await db.scalar(select(Message))
        alert = await db.scalar(select(Notification).where(Notification.kind == NotificationKind.alert))
    assert message.ai_summary == "The viva is on 20 Oct at 11 AM in Lab 3."
    assert message.ai_action == "Confirm your slot by Friday."
    assert alert.payload["ai"]["summary"] == message.ai_summary
    assert alert.payload["snippet"].startswith("Your project viva is on 20 October")

    # /reply → three suggestions; "2" → a full draft; /edit → revised; YES → sent, threaded under the original.
    assert await compose.handle_inbound(wa(f"/reply {message.ref}")) == "reply"
    suggestions = await last_reply()
    assert suggestions.startswith(f"💡 *Reply ideas* · #{message.ref}")
    assert "*1. Confirm slot*" in suggestions and "*2. Ask to move*" in suggestions
    assert f"/reply {message.ref} manual" in suggestions and "*2 mention I'm travelling*" in suggestions

    # Your own words steer the ideas.
    assert await compose.handle_inbound(wa(f"/ideas {message.ref} politely decline")) == "ideas"
    steered = await last_reply()
    assert "🎯 Following: _politely decline_" in steered and "*1. Decline kindly*" in steered

    await compose.handle_inbound(wa(f"/reply {message.ref}"))
    assert await compose.handle_inbound(wa("2 mention I'm travelling in the morning")) == "pick"
    draft = await last_reply()
    assert draft.startswith("✍️ *Your reply is ready* · _not sent yet_") and "*To:* notices@exam.univ.edu" in draft
    assert "Could I move my viva to the afternoon? I'm travelling in the morning." in draft
    assert "✅ *YES* · send it" in draft and "/edit" in draft
    # The list closes once a reply is picked: another number is plain chat, which nudges about the waiting draft.
    assert await compose.handle_inbound(wa("2")) == "text"
    assert (await last_reply()).startswith("Reply *YES* to send")

    assert await compose.handle_inbound(wa("/edit make it shorter")) == "edit"
    assert "Sir, may I have an afternoon viva slot?" in await last_reply()

    assert await compose.handle_inbound(wa("yes")) == "confirm"
    assert await compose.send_outbound(UUID(queued[0])) == "sent"
    [sent_mail] = await recipient_inbox(infra, "notices@exam.univ.edu")
    assert sent_mail.subject == "Re: Project viva slot" and "afternoon viva slot" in sent_mail.body_text
    async with session_factory()() as db:
        email = await db.scalar(select(OutboundEmail))
    assert email.reply_to_message_id == message.id and email.in_reply_to

    # /reply CODE <instructions> drafts straight away; /reply CODE manual gives the hand-written form.
    await compose.handle_inbound(wa(f"/reply {message.ref} ask which building Lab 3 is in"))
    assert "✍️ *Your reply is ready*" in await last_reply()
    await compose.handle_inbound(wa("no"))
    await compose.handle_inbound(wa(f"/reply {message.ref} manual"))
    assert "Subject: Re: Project viva slot" in await last_reply()

    # Every prompt that carried email text marked it as untrusted.
    assert all("untrusted" in p for p in model.prompts if "email" in p.lower() and "new email" not in p)


async def test_whatsapp_write_and_ask(client, setup, infra, model, queued):
    headers, mailbox_id = setup
    await enable_ai(client)
    mail(infra, "student@example.com", "Project viva slot", "Viva on 20 October at 11 AM.")
    await ingest.sync_mailbox(mailbox_id)

    await compose.handle_inbound(wa("/write ask for leave tomorrow"))
    assert "Who should I send it to?" in await last_reply()
    assert await compose.handle_inbound(wa("/write email office@univ.edu asking for leave tomorrow")) == "write"
    draft = await last_reply()
    assert "*To:* office@univ.edu" in draft and "*Subject:* Leave tomorrow" in draft
    assert (await client.get("/api/v1/outbound-emails", headers=headers)).json()["items"][0]["status"] == \
        OutboundStatus.awaiting_confirmation.value

    assert await compose.handle_inbound(wa("/ask when is my viva?")) == "ask"
    answer = await last_reply()
    assert answer.startswith("💬 *when is my viva?*") and "Your viva is on 20 Oct" in answer
    assert "📬 *From these emails*" in answer and "Project viva slot" in answer


async def test_ai_switched_off_falls_back_to_the_manual_form(client, setup, infra, model):
    headers, mailbox_id = setup
    await enable_ai(client)
    resp = await client.put("/api/v1/me/settings", headers=headers, json={"ai_enabled": False})
    assert resp.json()["ai_enabled"] is False
    mail(infra, "student@example.com", "Project viva slot", "Viva on 20 October at 11 AM.")
    await ingest.sync_mailbox(mailbox_id)

    async with session_factory()() as db:
        message = await db.scalar(select(Message))
    assert message.ai_summary is None and not model.prompts  # nothing was sent to the AI
    await compose.handle_inbound(wa(f"/reply {message.ref}"))
    assert "Subject: Re: Project viva slot" in await last_reply()
    await compose.handle_inbound(wa("/ask when is my viva?"))
    assert "isn't available" in await last_reply()
    status = (await client.get("/api/v1/ai/status", headers=headers)).json()
    assert status == {"available": False, "configured": True, "enabled_for_me": False}
    blocked = await client.post("/api/v1/ai/ask", headers=headers, json={"question": "viva?"})
    assert blocked.status_code == 503 and blocked.json()["code"] == "ai_unavailable"


async def test_website_reply_with_ai_rule_from_text_and_send(client, setup, infra, model, queued):
    headers, mailbox_id = setup
    await enable_ai(client)
    mail(infra, "student@example.com", "Project viva slot", "Viva on 20 October at 11 AM.")
    await ingest.sync_mailbox(mailbox_id)
    async with session_factory()() as db:
        message = await db.scalar(select(Message))

    detail = (await client.get(f"/api/v1/messages/{message.id}", headers=headers)).json()
    assert detail["ai_summary"] == "The viva is on 20 Oct at 11 AM in Lab 3."
    ideas = (await client.post(f"/api/v1/messages/{message.id}/ai/replies", headers=headers)).json()
    assert [i["label"] for i in ideas] == ["Confirm slot", "Ask to move", "Ask venue"]
    steered = (await client.post(f"/api/v1/messages/{message.id}/ai/replies", headers=headers,
                                 json={"guidance": "politely decline"})).json()
    assert steered[0]["label"] == "Decline kindly"

    resp = await client.post(f"/api/v1/messages/{message.id}/ai/draft", headers=headers,
                             json={"instructions": ideas[1]["instruction"]})
    assert resp.status_code == 200, resp.text
    draft = resp.json()
    assert draft["to"] == ["notices@exam.univ.edu"] and draft["reply_to_message_id"] == str(message.id)
    async with session_factory()() as db:
        assert (await db.scalar(select(OutboundEmail))) is None  # the website keeps drafts client-side

    revised = (await client.post("/api/v1/ai/revise", headers=headers, json={
        **{k: draft[k] for k in ("to", "cc", "subject", "body", "reply_to_message_id")},
        "instructions": "make it shorter"})).json()
    assert revised["body"].startswith("Sir, may I have")

    sent = await client.post("/api/v1/outbound-emails", headers=headers, json={
        "mailbox_id": revised["mailbox_id"], "to": revised["to"], "subject": revised["subject"],
        "body": revised["body"], "reply_to_message_id": str(message.id)})
    assert sent.status_code == 202, sent.text
    assert sent.json()["status"] == "queued" and len(queued) == 1
    assert await compose.send_outbound(UUID(queued[0])) == "sent"

    composed = (await client.post("/api/v1/ai/compose", headers=headers,
                                  json={"instructions": "email office@univ.edu for leave"})).json()
    assert composed["to"] == ["office@univ.edu"]
    rule = (await client.post("/api/v1/ai/rule", headers=headers,
                              json={"description": "exam and viva mail from my college"})).json()
    assert rule["name"] == "College exams"
    saved = await client.post("/api/v1/rules", headers=headers,
                              json={"name": rule["name"], "condition": rule["condition"]})
    assert saved.status_code == 201, saved.text
    answer = (await client.post("/api/v1/ai/ask", headers=headers, json={"question": "when is my viva?"})).json()
    assert answer["refs"][0]["message_id"] == str(message.id)
