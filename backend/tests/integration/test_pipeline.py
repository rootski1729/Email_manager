"""End-to-end: a real IMAP server (GreenMail) → sync → rules → outbox → dispatcher → WhatsApp (faked)."""

import smtplib
from email.message import EmailMessage
from uuid import UUID

import pytest
from sqlalchemy import func, select, update

from app.core.config import get_settings
from app.core.db import session_factory
from app.models import Mailbox, Notification, NotificationStatus
from app.notify.dispatcher import Dispatcher
from app.notify.waha import WahaError
from app.services import ingest
from tests.integration.conftest import sign_in

EXAM_RULE = {"name": "Exams", "condition": {"all": [
    {"field": "from.domain", "op": "domain_matches", "value": "univ.edu"},
    {"any": [
        {"field": "subject", "op": "contains", "value": ["exam", "admit card"]},
        {"field": "body", "op": "contains", "value": "hall ticket"},
    ]},
]}}


class FakeWaha:
    def __init__(self, fail: WahaError | None = None) -> None:
        self.sent: list[tuple[str, str]] = []
        self.fail = fail

    async def session_info(self) -> dict:
        return {"status": "WORKING", "me": {"id": "15550001111@c.us"}}

    async def typing(self, chat_id: str, on: bool) -> None:
        return None

    async def send_text(self, chat_id: str, text: str) -> str:
        if self.fail:
            raise self.fail
        self.sent.append((chat_id, text))
        return f"true_{chat_id}_{len(self.sent)}"


def send_mail(smtp: tuple[str, int], to: str, sender: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = sender, to, subject
    msg.set_content(body)
    with smtplib.SMTP(*smtp) as s:
        s.send_message(msg)


@pytest.fixture(autouse=True)
def no_coalesce_delay():
    settings = get_settings()
    old = settings.coalesce_window_s
    settings.coalesce_window_s = 0
    yield
    settings.coalesce_window_s = old


async def connect_imap(client, headers, infra, address: str) -> str:
    host, port = infra["imap"]
    resp = await client.post("/api/v1/mailboxes/imap", headers=headers, json={
        "address": address, "credentials": {"host": host, "port": port, "security": "plain",
                                             "username": address, "password": "secret"}})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def test_imap_sync_matches_and_queues_once(client, sent, infra):
    headers = await sign_in(client, sent)
    address = "student1@example.com"
    mailbox_id = await connect_imap(client, headers, infra, address)
    assert (await client.post("/api/v1/rules", headers=headers, json=EXAM_RULE)).status_code == 201

    send_mail(infra["smtp"], address, "Exam Cell <notices@exam.univ.edu>", "Admit card released", "Download now")
    send_mail(infra["smtp"], address, "Shop <deals@shop.com>", "Exam season sale", "50% off")
    send_mail(infra["smtp"], address, "Fake <x@notuniv.edu>", "Exam schedule", "phishing")
    send_mail(infra["smtp"], address, "Registrar <reg@univ.edu>", "Important", "Collect your HALL TICKET today")

    result = await ingest.sync_mailbox(UUID(mailbox_id))
    assert result == {"status": "ok", "scanned": 4, "matched": 2}

    messages = (await client.get("/api/v1/messages", headers=headers)).json()["items"]
    assert {m["subject"] for m in messages} == {"Admit card released", "Important"}
    assert all(m["rules"] == ["Exams"] for m in messages)
    assert messages[0]["mailbox_address"] == address

    notes = (await client.get("/api/v1/notifications", headers=headers)).json()["items"]
    assert len(notes) == 2 and {n["status"] for n in notes} == {"queued"}
    assert notes[0]["chat_id"] == "14155550123@c.us"

    # Nothing new: nothing rescanned.
    assert (await ingest.sync_mailbox(UUID(mailbox_id)))["scanned"] == 0

    # Even if Redis forgets and the cursor is rewound, the DB keeps it idempotent.
    from app.core.redis import get_redis

    await get_redis().flushdb()
    async with session_factory()() as db:
        mb = await db.get(Mailbox, UUID(mailbox_id))
        mb.sync_cursor = {**mb.sync_cursor, "last_uid": 0}
        await db.commit()
    again = await ingest.sync_mailbox(UUID(mailbox_id))
    assert again["scanned"] == 4 and again["matched"] == 0
    async with session_factory()() as db:
        assert await db.scalar(select(func.count()).select_from(Notification)) == 2


async def test_dispatcher_merges_burst_into_one_whatsapp_message(client, sent, infra):
    headers = await sign_in(client, sent)
    address = "student2@example.com"
    mailbox_id = await connect_imap(client, headers, infra, address)
    await client.post("/api/v1/rules", headers=headers, json=EXAM_RULE)
    for i in range(3):
        send_mail(infra["smtp"], address, "notices@exam.univ.edu", f"Exam update {i}", "details")
    await ingest.sync_mailbox(UUID(mailbox_id))

    waha = FakeWaha()
    dispatcher = Dispatcher(waha=waha, sleep=False)  # type: ignore[arg-type]
    assert await dispatcher.tick() == 3
    assert len(waha.sent) == 1
    chat_id, text = waha.sent[0]
    assert chat_id == "14155550123@c.us" and "3 important emails" in text and "Exam update 2" in text

    notes = (await client.get("/api/v1/notifications", headers=headers)).json()["items"]
    assert {n["status"] for n in notes} == {"sent"}

    # WAHA delivery receipts move them to delivered.
    resp = await client.post("/api/v1/webhooks/waha", json={
        "event": "message.ack", "payload": {"id": "true_14155550123@c.us_1", "ack": 2}})
    assert resp.status_code == 204
    notes = (await client.get("/api/v1/notifications", headers=headers)).json()["items"]
    assert {n["status"] for n in notes} == {"delivered"}


async def test_rate_limit_retry_and_dead_letters(client, sent, infra):
    headers = await sign_in(client, sent)
    address = "student3@example.com"
    mailbox_id = await connect_imap(client, headers, infra, address)
    await client.post("/api/v1/rules", headers=headers, json=EXAM_RULE)
    send_mail(infra["smtp"], address, "notices@exam.univ.edu", "Exam A", "x")
    await ingest.sync_mailbox(UUID(mailbox_id))

    # Retryable failure → failed with backoff.
    dispatcher = Dispatcher(waha=FakeWaha(fail=WahaError("boom", retryable=True)), sleep=False)  # type: ignore[arg-type]
    await dispatcher.tick()
    note = (await client.get("/api/v1/notifications", headers=headers)).json()["items"][0]
    assert note["status"] == "failed" and note["attempts"] == 1 and "boom" in note["last_error"]

    # Permanent failure → dead; manual retry puts it back in the queue.
    async with session_factory()() as db:
        await db.execute(update(Notification).values(next_attempt_at=func.now()))
        await db.commit()
    dispatcher = Dispatcher(waha=FakeWaha(fail=WahaError("bad chat", retryable=False)), sleep=False)  # type: ignore[arg-type]
    await dispatcher.tick()
    note = (await client.get("/api/v1/notifications", headers=headers)).json()["items"][0]
    assert note["status"] == "dead"
    resp = await client.post(f"/api/v1/notifications/{note['id']}/retry", headers=headers)
    assert resp.json()["status"] == "queued"

    # Global limiter with a burst of 1: the second chat waits instead of being sent.
    settings = get_settings()
    old = settings.rate_global_burst, settings.rate_global_per_min
    settings.rate_global_burst, settings.rate_global_per_min = 1, 1
    try:
        await client.post("/api/v1/destinations", headers=headers, json={"phone": "+14155550177", "label": "Mom"})
        from app.core.redis import get_redis

        await get_redis().delete("rl:waha:global")
        async with session_factory()() as db:
            first = await db.scalar(select(Notification))
            assert first is not None
            db.add(Notification(user_id=first.user_id, chat_id="14155550177@c.us", kind="system",
                                payload={"text": "hello"}, status=NotificationStatus.queued,
                                dedupe_key="manual-1"))
            await db.commit()
        waha = FakeWaha()
        await Dispatcher(waha=waha, sleep=False).tick()  # type: ignore[arg-type]
        assert len(waha.sent) == 1
        async with session_factory()() as db:
            statuses = sorted((await db.scalars(select(Notification.status))).all())
        assert statuses == [NotificationStatus.queued, NotificationStatus.sent]
    finally:
        settings.rate_global_burst, settings.rate_global_per_min = old


async def test_quiet_hours_hold_then_digest(client, sent, infra):
    headers = await sign_in(client, sent)
    address = "student4@example.com"
    mailbox_id = await connect_imap(client, headers, infra, address)
    await client.post("/api/v1/rules", headers=headers, json=EXAM_RULE)
    await client.put("/api/v1/me/settings", headers=headers, json={
        "quiet_hours": {"enabled": True, "start": "00:00", "end": "23:59"}})
    for i in range(2):
        send_mail(infra["smtp"], address, "notices@exam.univ.edu", f"Exam night {i}", "x")
    await ingest.sync_mailbox(UUID(mailbox_id))

    waha = FakeWaha()
    await Dispatcher(waha=waha, sleep=False).tick()  # type: ignore[arg-type]
    assert waha.sent == []
    notes = (await client.get("/api/v1/notifications?status=held", headers=headers)).json()["items"]
    assert len(notes) == 2

    await client.put("/api/v1/me/settings", headers=headers, json={"quiet_hours": {"enabled": False}})
    from app.services.outbox import flush_held

    async with session_factory()() as db:
        assert await flush_held(db) == 1
    await Dispatcher(waha=waha, sleep=False).tick()  # type: ignore[arg-type]
    assert len(waha.sent) == 1 and "While you were away: 2 important emails" in waha.sent[0][1]
    folded = (await client.get("/api/v1/notifications?status=folded", headers=headers)).json()["items"]
    assert len(folded) == 2


async def test_bad_imap_login_is_reported(client, sent, infra, monkeypatch):
    headers = await sign_in(client, sent)
    resp = await client.post("/api/v1/mailboxes/imap", headers=headers, json={
        "address": "x@example.com", "credentials": {"host": "127.0.0.1", "port": 1, "security": "plain",
                                                    "username": "x", "password": "y"}})
    assert resp.status_code == 422 and resp.json()["code"] == "imap_unreachable"


async def test_imap_credentials_can_be_fixed_in_place(client, sent, infra):
    headers = await sign_in(client, sent)
    mailbox_id = await connect_imap(client, headers, infra, "student5@example.com")
    host, port = infra["imap"]
    bad = {"credentials": {"host": "127.0.0.1", "port": 1, "security": "plain", "username": "x", "password": "y"}}
    url = f"/api/v1/mailboxes/{mailbox_id}/credentials"
    assert (await client.put(url, headers=headers, json=bad)).status_code == 422
    good = {"credentials": {"host": host, "port": port, "security": "plain",
                            "username": "student5@example.com", "password": "new"}}
    resp = await client.put(f"/api/v1/mailboxes/{mailbox_id}/credentials", headers=headers, json=good)
    assert resp.status_code == 200 and resp.json()["status"] == "active"
