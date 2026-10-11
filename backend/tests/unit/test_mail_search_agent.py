"""Search queries for each provider, and the tool-using loop behind the mail assistant."""

import json
from datetime import date
from typing import Any

import pytest

from app.ai import agent as agent_module
from app.ai.agent import Tool, run_agent
from app.ai.client import AIUnavailable
from app.providers.search import SearchQuery, gmail_query, imap_criteria


def test_gmail_query_uses_operators_and_quotes_phrases() -> None:
    q = SearchQuery(sender="abhi", words=("api", "rate limit"), subject="review", after=date(2026, 9, 1),
                    before=date(2026, 10, 12), has_attachment=True)
    assert gmail_query(q) == ('from:abhi subject:(review) api "rate limit" after:2026/09/01 before:2026/10/12 '
                              "has:attachment -in:chats")


def test_person_means_from_or_to_or_cc() -> None:
    assert gmail_query(SearchQuery(person="abhi", words=("api",))) == "{from:abhi to:abhi cc:abhi} api -in:chats"
    assert imap_criteria(SearchQuery(person="abhi"))[0] == 'OR FROM "abhi" OR TO "abhi" CC "abhi"'
    assert SearchQuery(person="Abhi").describe() == "with Abhi"


def test_any_of_words_and_no_newsletters() -> None:
    q = SearchQuery(any_words=("selected", "offer letter", "shortlisted"), exclude_newsletters=True)
    assert gmail_query(q) == ('{selected "offer letter" shortlisted} -category:promotions -category:social '
                              "-category:forums -in:chats")
    assert imap_criteria(q)[0] == ('OR TEXT "selected" OR TEXT "offer letter" TEXT "shortlisted" '
                                   'NOT HEADER "List-Unsubscribe" ""')
    assert q.describe() == 'mentioning "selected" or "offer letter" or "shortlisted" · no newsletters'


def test_imap_criteria_are_escaped_and_dated() -> None:
    criteria, utf8 = imap_criteria(SearchQuery(sender='Abhi "K"', words=("api",), after=date(2026, 9, 1)))
    assert criteria == 'FROM "Abhi K" TEXT "api" SINCE 01-Sep-2026' and utf8 is False
    criteria, utf8 = imap_criteria(SearchQuery(words=("परीक्षा",)))
    assert criteria == 'TEXT "परीक्षा"' and utf8 is True
    assert imap_criteria(SearchQuery())[0].startswith("SINCE ")  # never an unbounded search


def test_terms_are_cleaned_and_capped() -> None:
    q = SearchQuery(words=(*tuple(f"w{i}" for i in range(10)), "(x) OR y"), sender="a\\b")
    gq = gmail_query(q)
    assert "w5" in gq and "w6" not in gq and "\\" not in gq and "(" not in gq.replace("subject:(", "")
    assert SearchQuery(sender="abhi", words=("api",)).describe() == 'from abhi · about "api"'


class Script:
    """A fake model: each step returns the next scripted assistant message and records what it was shown."""

    def __init__(self, *steps: dict[str, Any]) -> None:
        self.steps, self.seen = list(steps), []

    async def __call__(self, messages, tools, *, max_tokens=600):
        self.seen.append((list(messages), [t["function"]["name"] for t in tools]))
        return self.steps.pop(0)


def call(name: str, args: Any, id_: str = "c1") -> dict[str, Any]:
    raw = args if isinstance(args, str) else json.dumps(args)
    return {"tool_calls": [{"id": id_, "type": "function", "function": {"name": name, "arguments": raw}}]}


async def test_agent_calls_tools_and_returns_text(monkeypatch) -> None:
    script = Script(call("search", {"q": "api"}), {"content": "Found **1** email."})
    monkeypatch.setattr(agent_module, "complete_tools", script)
    seen: list[dict] = []

    async def search(args: dict) -> dict:
        seen.append(args)
        return {"results": [{"n": 1, "subject": "API"}]}

    run = await run_agent([{"role": "user", "content": "find api"}],
                          [Tool("search", "Search", {"type": "object"}, search)])
    assert run.text == "Found **1** email." and run.steps == 2 and run.tool_calls == ["search"]
    assert seen == [{"q": "api"}]
    messages, tools = script.seen[1]
    assert tools == ["search"] and messages[-1]["role"] == "tool" and json.loads(messages[-1]["content"])["results"]


async def test_bad_arguments_and_unknown_tools_go_back_to_the_model(monkeypatch) -> None:
    script = Script(call("search", "{not json"), call("delete_everything", {}, "c2"), {"content": "Sorry."})
    monkeypatch.setattr(agent_module, "complete_tools", script)

    async def never(args: dict) -> dict:
        raise AssertionError("must not run")

    run = await run_agent([{"role": "user", "content": "x"}], [Tool("search", "S", {"type": "object"}, never)])
    assert run.text == "Sorry."
    errors = [json.loads(m["content"])["error"] for m in script.seen[2][0] if m["role"] == "tool"]
    assert errors[0].startswith("bad arguments") and errors[1] == "unknown tool delete_everything"


async def test_the_last_step_has_no_tools_and_must_answer(monkeypatch) -> None:
    script = Script(call("search", {}), call("search", {}, "c2"), {"content": "Here's what I have."})
    monkeypatch.setattr(agent_module, "complete_tools", script)

    async def search(args: dict) -> dict:
        return {"results": []}

    run = await run_agent([{"role": "user", "content": "x"}], [Tool("search", "S", {"type": "object"}, search)],
                          max_steps=3)
    assert run.text == "Here's what I have." and script.seen[2][1] == []  # no tools offered on the last step
    assert script.seen[2][0][-1]["content"].startswith("Stop using tools")

    monkeypatch.setattr(agent_module, "complete_tools", Script({"content": "  "}))
    with pytest.raises(AIUnavailable):
        await run_agent([{"role": "user", "content": "x"}], [])


def test_a_mailbox_filter_needs_the_person_to_mention_it() -> None:
    from app.services.mail_agent import _asked_mailbox

    assert _asked_mailbox("rahul@fogteams.com", "find the offer email") is None
    assert _asked_mailbox("rahul@fogteams.com", "find it in my fogteams mail") == "rahul@fogteams.com"
    assert _asked_mailbox("rahuljoshi9271@gmail.com", "check my gmail") == "rahuljoshi9271@gmail.com"
    assert _asked_mailbox("", "anything") is None


def test_names_drop_the_person_themselves() -> None:
    from app.services.mail_agent import _name

    assert [_name(v) for v in ("Abhi and I", "me and Abhi", "Abhi with me", "Abhishek Rao", None)] == \
        ["Abhi", "Abhi", "Abhi", "Abhishek Rao", ""]


def test_invisible_preview_padding_is_removed() -> None:
    from email.message import EmailMessage
    from uuid import uuid4

    from app.providers.mime import envelope_from_bytes

    msg = EmailMessage()
    msg["Subject"] = "Hi"
    msg.set_content("Your order\u200c\u00a0\u034f\u200b is ready\ufeff")
    text = envelope_from_bytes(bytes(msg), mailbox_id=uuid4(), message_id="1", full=True, snippet_chars=200).body_text
    assert "\u200c" not in text and "\u034f" not in text and "\ufeff" not in text and "Your order" in text


async def test_the_same_email_in_two_mailboxes_is_shown_once(monkeypatch) -> None:
    from types import SimpleNamespace

    from app.services import mail_search
    from app.services.mail_search import Hit

    def hit(box: str, subject: str, date: str) -> Hit:
        return Hit(mailbox_id=box, mailbox=f"{box}@x.io", ref=f"{box}-{subject}", from_name="A",
                   from_address="A@acme.io", subject=subject, date=date, snippet="", has_attachments=False)

    boxes = [SimpleNamespace(id="b1", address="b1@x.io"), SimpleNamespace(id="b2", address="b2@x.io")]
    answers = {"b1": [hit("b1", "Offer", "2026-10-01T10:00:05+00:00"), hit("b1", "Older", "2026-09-01T10:00:00")],
               "b2": [hit("b2", "offer ", "2026-10-01T10:00:09+00:00")]}

    async def boxes_of(db, user_id):
        return boxes

    async def search_one(box, query, limit):
        return answers[box.id]

    monkeypatch.setattr(mail_search, "searchable_mailboxes", boxes_of)
    monkeypatch.setattr(mail_search, "_search_one", search_one)
    outcome = await mail_search.search_all(None, SimpleNamespace(id="u"), SearchQuery(words=("offer",)))
    assert [h.subject.strip().lower() for h in outcome.hits] == ["offer", "older"]
    assert outcome.searched == ["b1@x.io", "b2@x.io"]


def test_a_reply_to_your_own_email_goes_to_who_you_wrote_to() -> None:
    from app.models import Message
    from app.services.assistant import reply_address

    own = {"me@x.io", "me@work.io"}
    sent = Message(from_address="Me@x.io", to_addresses=["me@work.io", "abhi@acme.io"], headers={})
    received = Message(from_address="abhi@acme.io", to_addresses=["me@x.io"], headers={"reply-to": ["Abhi <a@b.io>"]})
    assert reply_address(sent, None, own) == "abhi@acme.io"
    assert reply_address(received, None, own) == "a@b.io"
    assert reply_address(sent, None) == "Me@x.io"  # without knowing the person's addresses, the sender
