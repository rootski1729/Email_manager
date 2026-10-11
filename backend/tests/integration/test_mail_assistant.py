"""The mail assistant end to end: a real IMAP mailbox, a scripted model choosing tools, WhatsApp and the website."""

import json
from typing import Any
from uuid import UUID

import pytest
from sqlalchemy import select

from app.ai import agent as agent_module
from app.core.db import session_factory
from app.models import Message, OutboundEmail, OutboundStatus, User
from app.providers.search import SearchQuery
from app.services import compose, mail_search
from tests.integration.test_ai import enable_ai, model, queued, setup, sse_events  # noqa: F401  (fixtures)
from tests.integration.test_compose import recipient_inbox
from tests.integration.test_engagement import last_reply, mail, no_delay, notes, ready, wa  # noqa: F401


def seed_mailbox(infra) -> None:
    mail(infra, "student@example.com", "API rate limits for the partner integration",
         "Hi, we should agree the API rate limits before Friday. I suggest 100 requests per minute.",
         sender="Abhi Kumar <abhi@acme.io>")
    mail(infra, "student@example.com", "Lunch on Friday?", "Want to grab lunch?", sender="Abhi Kumar <abhi@acme.io>")
    mail(infra, "student@example.com", "API review notes", "My notes on the API review.",
         sender="Riya <riya@acme.io>")


async def test_search_all_uses_the_mailboxs_own_search(client, ready, infra):  # noqa: F811
    _headers, _ = ready
    seed_mailbox(infra)
    async with session_factory()() as db:
        user = await db.scalar(select(User))
        outcome = await mail_search.search_all(db, user, SearchQuery(sender="abhi", words=("api",)))
        assert [h.subject for h in outcome.hits] == ["API rate limits for the partner integration"]
        assert outcome.searched == ["student@example.com"] and outcome.problems == []
        assert "100 requests per minute" in outcome.hits[0].snippet
        everything_from_abhi = await mail_search.search_all(db, user, SearchQuery(sender="abhi"))
        assert {h.subject for h in everything_from_abhi.hits} == {"API rate limits for the partner integration",
                                                                  "Lunch on Friday?"}


class Brain:
    """Scripted model: searches for what the person describes, then answers; drafts when asked to reply."""

    def __init__(self) -> None:
        self.prompts: list[list[dict[str, Any]]] = []

    async def __call__(self, messages, tools, *, max_tokens=600):
        self.prompts.append(messages)
        last = messages[-1]
        if last["role"] == "tool":
            data = json.loads(last["content"])
            if "results" in data:
                return {"content": f"I found **{data['found']}** email from Abhi about the API. Is it this one?"}
            return {"content": "Done."}
        text = last["content"].lower()
        if "reply" in text:
            return {"tool_calls": [{"id": "d1", "type": "function", "function": {
                "name": "draft_reply", "arguments": json.dumps({"n": 1, "instructions": "say thanks, I'll review"})}}]}
        return {"tool_calls": [{"id": "s1", "type": "function", "function": {
            "name": "search_mail", "arguments": json.dumps({"sender": "abhi", "words": ["api"]})}}]}


@pytest.fixture
def brain(monkeypatch) -> Brain:
    b = Brain()
    monkeypatch.setattr(agent_module, "complete_tools", b)
    return b


async def test_whatsapp_find_open_reply_and_send(client, setup, infra, model, queued, brain):  # noqa: F811
    await enable_ai(client)
    seed_mailbox(infra)

    assert await compose.handle_inbound(wa("/find the email where abhi and I discussed the api")) == "assistant"
    searching, answer = [n.payload["text"] for n in (await notes())[-2:]]
    assert searching.startswith("🔎 Searching your mail: from abhi")
    # (The test mail server is shared between tests, so an earlier test's copy may be found too.)
    assert answer.startswith("I found *") and "email from Abhi about the API." in answer
    assert "*1.* *Abhi Kumar* · " in answer and "API rate limits for the partner integration" in answer
    assert "Reply with a number to open one" in answer
    system = brain.prompts[0][0]["content"]
    assert "untrusted data" in system and "can't send email" in system and "student@example.com" in system

    # "1" opens the result: it's kept with a code and shown in full.
    assert await compose.handle_inbound(wa("1")) == "pick"
    opened = await last_reply()
    assert opened.startswith("📖 *API rate limits for the partner integration*")
    assert "100 requests per minute" in opened
    async with session_factory()() as db:
        kept = await db.scalar(select(Message).where(Message.subject.like("API rate limits%")))
    assert kept is not None and kept.ref and f"*/reply {kept.ref}*" in opened

    # Plain text continues the conversation; asking to reply prepares a draft that waits for YES.
    assert await compose.handle_inbound(wa("reply saying thanks, I'll review it")) == "text"
    assert "✍️ *Your reply is ready*" in await last_reply()
    assert await compose.handle_inbound(wa("yes")) == "confirm"
    assert await compose.send_outbound(UUID(queued[0])) == "sent"
    [sent] = await recipient_inbox(infra, "abhi@acme.io")
    assert sent.subject == "Re: API rate limits for the partner integration"
    async with session_factory()() as db:
        email = await db.scalar(select(OutboundEmail))
    assert email.status == OutboundStatus.sent and email.reply_to_message_id == kept.id

    # /done ends it: ordinary chat is ignored again.
    await compose.handle_inbound(wa("/done"))
    assert await compose.handle_inbound(wa("just a note to self")) == "ignored"


async def test_website_chat_streams_and_opens_results(client, setup, infra, model, brain):  # noqa: F811
    headers, _ = setup
    await enable_ai(client)
    seed_mailbox(infra)

    resp = await client.post("/api/v1/assistant/chat", headers=headers,
                             json={"message": "the email where abhi and I discussed the api"})
    assert resp.status_code == 200 and resp.headers["content-type"].startswith("text/event-stream")
    events = sse_events(resp.text)
    names = [e for e, _ in events]
    assert names[0] == "conversation" and "status" in names and names[-1] == "done"
    conversation = events[0][1]["conversation_id"]
    final = next(d for e, d in events if e == "results" and d.get("final"))
    assert {i["subject"] for i in final["items"]} == {"API rate limits for the partner integration"}
    assert "".join(d["text"] for e, d in events if e == "delta").startswith("I found **")

    # A follow-up in the same conversation remembers the numbered results.
    resp = await client.post("/api/v1/assistant/chat", headers=headers,
                             json={"message": "reply to it", "conversation_id": conversation})
    done = sse_events(resp.text)[-1]
    assert done[0] == "done" and done[1]["draft"]["to"] == ["abhi@acme.io"]
    assert "[Results shown:\n1. Abhi Kumar" in brain.prompts[-1][2]["content"]  # history carries the numbers

    opened = await client.post(f"/api/v1/assistant/conversations/{conversation}/results/1/open", headers=headers)
    assert opened.status_code == 200, opened.text
    detail = await client.get(f"/api/v1/messages/{opened.json()['message_id']}", headers=headers)
    assert detail.json()["subject"] == "API rate limits for the partner integration"
    assert (await client.post(f"/api/v1/assistant/conversations/{conversation}/results/9/open",
                              headers=headers)).status_code == 404
    assert (await client.delete(f"/api/v1/assistant/conversations/{conversation}", headers=headers)).status_code == 204
    assert (await client.post("/api/v1/assistant/conversations/not-a-hex/results/1/open",
                              headers=headers)).status_code == 422
