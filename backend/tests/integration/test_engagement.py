"""Deadline radar, alert actions on WhatsApp, urgent rules, starter packs, onboarding and the weekly recap."""

import json
import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from app.core.db import session_factory
from app.core.redis import Keys, get_redis
from app.models import (
    Event,
    EventStatus,
    Message,
    Notification,
    NotificationKind,
    NotificationStatus,
    OutboundEmail,
    User,
)
from app.notify.dispatcher import Dispatcher
from app.services import compose, ingest, recap
from tests.integration.conftest import sign_in
from tests.integration.test_pipeline import FakeWaha, connect_imap

PHONE, CHAT = "+14155550123", "14155550123@c.us"
IST = ZoneInfo("Asia/Kolkata")
EXAMS = {"name": "Exams", "condition": {"field": "from.domain", "op": "domain_matches", "value": "univ.edu"}}
counter = iter(range(1, 100_000))


@pytest.fixture(autouse=True)
def no_delay():
    from app.core.config import get_settings

    settings = get_settings()
    old = settings.coalesce_window_s
    settings.coalesce_window_s = 0
    yield
    settings.coalesce_window_s = old


def mail(infra, to: str, subject: str, body: str, sender: str = "Exam Cell <notices@exam.univ.edu>",
         ics: str | None = None) -> None:
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = sender, to, subject
    msg["Message-ID"] = f"<orig-{next(counter)}@univ.edu>"
    msg.set_content(body)
    if ics:
        msg.add_attachment(ics.encode(), maintype="text", subtype="calendar", filename="invite.ics")
    with smtplib.SMTP(*infra["smtp"]) as s:
        s.send_message(msg)


def wa(body: str, quoted: str | None = None) -> dict:
    payload = {"id": f"false_{CHAT}_{next(counter):06d}", "from": CHAT, "to": "15550001111@c.us",
               "fromMe": False, "body": body, "hasMedia": False}
    if quoted:
        payload["replyTo"] = {"id": "X", "body": quoted}
    return payload


async def notes(kind: NotificationKind | None = None) -> list[Notification]:
    async with session_factory()() as db:
        stmt = select(Notification).order_by(Notification.created_at)
        if kind:
            stmt = stmt.where(Notification.kind == kind)
        return list((await db.scalars(stmt)).all())


async def last_reply() -> str:
    return (await notes(NotificationKind.reply))[-1].payload["text"]


@pytest.fixture
async def ready(client, sent, infra):
    headers = await sign_in(client, sent, phone=PHONE)
    await client.patch("/api/v1/me", headers=headers, json={"timezone": "Asia/Kolkata"})
    mailbox_id = await connect_imap(client, headers, infra, "student@example.com")
    assert (await client.post("/api/v1/rules", headers=headers, json=EXAMS)).status_code == 201
    return headers, UUID(mailbox_id)


async def test_exam_email_gets_code_event_and_reminders(client, ready, infra):
    headers, mailbox_id = ready
    exam_day = (datetime.now(IST) + timedelta(days=10)).date()
    mail(infra, "student@example.com", "Admit card released",
         f"Your end-semester exam is on {exam_day:%d %b %Y} at 10:00 AM in Hall B.")
    await ingest.sync_mailbox(mailbox_id)

    async with session_factory()() as db:
        message = await db.scalar(select(Message))
        [event] = (await db.scalars(select(Event))).all()
    assert message.ref == "32"  # the first code
    assert event.status == EventStatus.upcoming and event.kind.value == "exam"
    assert event.starts_at == datetime.combine(exam_day, datetime.min.time().replace(hour=10), tzinfo=IST)

    reminders = await notes(NotificationKind.reminder)
    assert sorted(r.next_attempt_at for r in reminders) == [event.starts_at - timedelta(days=1),
                                                            event.starts_at - timedelta(hours=2)]
    waha = FakeWaha()
    await Dispatcher(waha=waha, sleep=False).tick()  # type: ignore[arg-type]
    [(_, text)] = waha.sent  # the alert now; reminders wait for their time
    assert "#32" in text and "I'll remind you" in text and "/open 32" in text

    detail = (await client.get(f"/api/v1/messages/{message.id}", headers=headers)).json()
    assert detail["ref"] == "32" and detail["events"][0]["kind"] == "exam"

    # Moving the exam reschedules; dismissing cancels.
    new_start = (event.starts_at + timedelta(days=1)).isoformat()
    await client.patch(f"/api/v1/deadlines/{event.id}", headers=headers, json={"starts_at": new_start})
    pending = [r for r in await notes(NotificationKind.reminder) if r.status == NotificationStatus.queued]
    assert len(pending) == 2 and all(r.payload["event"]["starts_at"] == new_start for r in pending)
    await client.patch(f"/api/v1/deadlines/{event.id}", headers=headers, json={"status": "dismissed"})
    assert all(r.status == NotificationStatus.cancelled for r in await notes(NotificationKind.reminder))


async def test_calendar_invite_and_cancellation(client, ready, infra):
    headers, mailbox_id = ready
    start = (datetime.now(UTC) + timedelta(days=5)).replace(microsecond=0)
    ics = ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:{m}\r\nBEGIN:VEVENT\r\nUID:int-42@univ.edu\r\n"
           "SUMMARY:Technical interview\r\nDTSTART:{s}\r\nDTEND:{e}\r\nLOCATION:Google Meet\r\nEND:VEVENT\r\n"
           "END:VCALENDAR\r\n")
    fmt = "%Y%m%dT%H%M%SZ"
    mail(infra, "student@example.com", "Invitation: interview", "See invite",
         ics=ics.format(m="REQUEST", s=start.strftime(fmt), e=(start + timedelta(hours=1)).strftime(fmt)))
    await ingest.sync_mailbox(mailbox_id)
    [event] = (await client.get("/api/v1/deadlines", headers=headers)).json()
    assert event["source"] == "ics" and event["kind"] == "interview" and event["location"] == "Google Meet"

    mail(infra, "student@example.com", "Cancelled: interview", "Cancelled",
         ics=ics.format(m="CANCEL", s=start.strftime(fmt), e=(start + timedelta(hours=1)).strftime(fmt)))
    await ingest.sync_mailbox(mailbox_id)
    assert (await client.get("/api/v1/deadlines", headers=headers)).json() == []
    assert all(r.status == NotificationStatus.cancelled for r in await notes(NotificationKind.reminder))


async def test_muted_sender_is_stored_but_not_alerted(client, ready, infra):
    headers, mailbox_id = ready
    await client.put("/api/v1/me/settings", headers=headers, json={"muted_senders": ["univ.edu"]})
    mail(infra, "student@example.com", "Library newsletter", "hello")
    await ingest.sync_mailbox(mailbox_id)
    assert len((await client.get("/api/v1/messages", headers=headers)).json()["items"]) == 1
    assert await notes(NotificationKind.alert) == []


async def test_urgent_rules_skip_quiet_hours(client, ready, infra):
    headers, mailbox_id = ready
    await client.post("/api/v1/rules", headers=headers, json={
        "name": "Interviews", "condition": {"field": "subject", "op": "contains", "value": "interview"},
        "actions": {"notify": {"urgent": True}}})
    await client.put("/api/v1/me/settings", headers=headers, json={
        "quiet_hours": {"enabled": True, "start": "00:00", "end": "23:59"}})
    mail(infra, "student@example.com", "Interview tomorrow", "x", sender="hr@company.com")
    mail(infra, "student@example.com", "Library hours", "x")
    await ingest.sync_mailbox(mailbox_id)
    waha = FakeWaha()
    await Dispatcher(waha=waha, sleep=False).tick()  # type: ignore[arg-type]
    assert len(waha.sent) == 1 and "🚨 *Urgent*" in waha.sent[0][1] and "Interview tomorrow" in waha.sent[0][1]
    held = [n for n in await notes(NotificationKind.alert) if n.status == NotificationStatus.held]
    assert len(held) == 1


async def test_whatsapp_actions_on_alerts(client, ready, infra, monkeypatch):
    headers, mailbox_id = ready
    mail(infra, "student@example.com", "Fee payment notice", "Please pay the semester fee at the counter.")
    await ingest.sync_mailbox(mailbox_id)
    alert_text = "📬 *Important email*  #32\n*Subject:* Fee payment notice"

    assert await compose.handle_inbound(wa("/recent")) == "recent"
    assert "*#32* Fee payment notice" in await last_reply()

    assert await compose.handle_inbound(wa("/open 32")) == "open"
    assert "Please pay the semester fee" in await last_reply()

    # Quote the alert and type a plain word.
    assert await compose.handle_inbound(wa("remind 2h", quoted=alert_text)) == "remind"
    assert (await last_reply()).startswith("⏰ *Reminder set*\n\n*Fee payment notice*  #32")
    [reminder] = await notes(NotificationKind.reminder)
    assert abs((reminder.next_attempt_at - datetime.now(UTC)) - timedelta(hours=2)) < timedelta(minutes=1)
    assert await compose.handle_inbound(wa("/remind 32 someday")) == "remind"
    assert "didn't understand" in await last_reply()

    assert await compose.handle_inbound(wa("/mute 32 domain")) == "mute"
    settings = (await client.get("/api/v1/me/settings", headers=headers)).json()
    assert settings["muted_senders"] == ["exam.univ.edu"]
    await compose.handle_inbound(wa("/unmute exam.univ.edu"))
    assert (await client.get("/api/v1/me/settings", headers=headers)).json()["muted_senders"] == []

    assert await compose.handle_inbound(wa("/open ZZ")) == "open"
    assert "can't find an alert with code *ZZ*" in await last_reply()
    assert await compose.handle_inbound(wa("/upcoming")) == "upcoming"


async def test_reply_threads_under_the_original(client, ready, infra, monkeypatch):
    headers, mailbox_id = ready
    smtp_host, smtp_port = infra["smtp"]
    imap_host, imap_port = infra["imap"]
    await client.put(f"/api/v1/mailboxes/{mailbox_id}/credentials", headers=headers, json={"credentials": {
        "host": imap_host, "port": imap_port, "security": "plain", "username": "student@example.com",
        "password": "secret", "smtp_host": smtp_host, "smtp_port": smtp_port, "smtp_security": "plain"}})
    queued: list[str] = []

    async def fake_kick(email_id: str) -> None:
        queued.append(email_id)

    monkeypatch.setattr(compose, "kick_send", fake_kick)
    mail(infra, "student@example.com", "Project viva slot", "Choose a slot")
    await ingest.sync_mailbox(mailbox_id)

    assert await compose.handle_inbound(wa("/reply 32")) == "reply"
    form = await last_reply()
    assert "To: notices@exam.univ.edu" in form and "Subject: Re: Project viva slot" in form
    filled = form.replace("Body:\nWrite your message here.", "Body:\nI'll take the 10 AM slot.")
    await compose.handle_inbound(wa(filled))
    await compose.handle_inbound(wa("yes"))
    assert await compose.send_outbound(UUID(queued[0])) == "sent"
    async with session_factory()() as db:
        email = await db.scalar(select(OutboundEmail))
    assert email.in_reply_to and email.in_reply_to.startswith("<orig-") and email.reply_to_message_id


async def test_packs_suggestions_and_sender_rules(client, ready, infra):
    headers, mailbox_id = ready
    packs = (await client.get("/api/v1/rules/packs", headers=headers)).json()
    assert {p["id"] for p in packs} >= {"exams", "jobs", "bank", "security"}
    rule = (await client.post("/api/v1/rules/packs/jobs/install", headers=headers)).json()
    assert rule["source"] == "pack:jobs" and rule["actions"]["notify"]["urgent"] is True
    assert (await client.post("/api/v1/rules/packs/jobs/install", headers=headers)).status_code == 409

    mail(infra, "student@example.com", "Hall ticket for end-sem", "x", sender="Registrar <registrar@akgec.ac.in>")
    mail(infra, "student@example.com", "Fee receipt", "x", sender="Accounts <accounts@akgec.ac.in>")
    mail(infra, "student@example.com", "Big sale", "x", sender="offers@shop.com")
    data = (await client.get(f"/api/v1/rules/suggestions?mailbox_id={mailbox_id}", headers=headers)).json()
    assert data["scanned"] >= 3
    assert any(s["pack"]["id"] == "exams" and s["count"] >= 1 for s in data["packs"])
    assert [s["domain"] for s in data["senders"]] == ["akgec.ac.in"]
    resp = await client.post("/api/v1/rules/from-sender", headers=headers, json={"domain": "akgec.ac.in"})
    assert resp.status_code == 201 and resp.json()["source"] == "sender:akgec.ac.in"


async def test_onboarding_and_test_alert(client, ready):
    headers, _ = ready
    data = (await client.get("/api/v1/me/onboarding", headers=headers)).json()
    done = {s["id"]: s["done"] for s in data["steps"]}
    assert done["mailbox"] and done["rule"] and not done["test"] and data["total"] == 6
    for _ in range(3):
        assert (await client.post("/api/v1/me/test-alert", headers=headers)).status_code == 202
    assert (await client.post("/api/v1/me/test-alert", headers=headers)).status_code == 429
    [test, *_] = await notes(NotificationKind.system)
    assert "This is a test alert" in test.payload["text"] and "#TEST" in test.payload["text"]
    data = (await client.get("/api/v1/me/onboarding", headers=headers)).json()
    assert {s["id"]: s["done"] for s in data["steps"]}["test"]
    await client.post("/api/v1/me/onboarding/dismiss", headers=headers)
    assert (await client.get("/api/v1/me/onboarding", headers=headers)).json()["dismissed"]


async def test_calendar_feed(client, ready):
    headers, _ = ready
    start = (datetime.now(UTC) + timedelta(days=3)).replace(microsecond=0)
    resp = await client.post("/api/v1/deadlines", headers=headers, json={
        "title": "Exam: Physics", "kind": "exam", "starts_at": start.isoformat()})
    assert resp.status_code == 201
    assert len(await notes(NotificationKind.reminder)) == 2
    feed = (await client.get("/api/v1/deadlines/calendar", headers=headers)).json()
    path = feed["url"].split("://", 1)[1].split("/", 1)[1]
    ics = await client.get(f"/{path}")
    assert ics.status_code == 200 and "SUMMARY:Exam: Physics" in ics.text
    assert feed["webcal_url"].startswith("webcal://")
    await client.post("/api/v1/deadlines/calendar/rotate", headers=headers)
    assert (await client.get(f"/{path}")).status_code == 404


async def test_weekly_recap(client, ready, infra):
    _, mailbox_id = ready
    mail(infra, "student@example.com", "Results declared", "x")
    await ingest.sync_mailbox(mailbox_id)
    sunday = datetime(2026, 10, 11, 18, 30, tzinfo=IST)
    assert recap.recap_due("Asia/Kolkata", None, sunday) and not recap.recap_due("Asia/Kolkata", sunday, sunday)
    assert not recap.recap_due("Asia/Kolkata", None, sunday - timedelta(hours=1))
    assert await recap.send_due_recaps(now=sunday.astimezone(UTC)) == 1
    assert await recap.send_due_recaps(now=sunday.astimezone(UTC)) == 0  # once a week
    [item] = await notes(NotificationKind.recap)
    assert "Your week with MailSentinel" in item.payload["text"] and "Exam Cell" in item.payload["text"]


async def test_ref_counter_survives_redis_loss(client, ready, infra):
    _, mailbox_id = ready
    mail(infra, "student@example.com", "First", "x")
    await ingest.sync_mailbox(mailbox_id)
    async with session_factory()() as db:
        user = await db.scalar(select(User))
    await get_redis().delete(Keys.ref_seq(user.id))
    mail(infra, "student@example.com", "Second", "x")
    await ingest.sync_mailbox(mailbox_id)
    async with session_factory()() as db:
        refs = (await db.scalars(select(Message.ref).order_by(Message.created_at))).all()
    assert refs[0] != refs[1]
    assert json.dumps(refs)


def test_no_two_routes_share_a_method_and_path():
    """Regression: the deadline list once shadowed the live-update stream at GET /api/v1/events."""
    from fastapi.routing import APIRoute

    from app.main import create_app

    def walk(container, ancestors=""):
        for route in container.routes:
            if isinstance(route, APIRoute):
                yield ancestors + route.path, route.methods
            elif hasattr(route, "original_router"):  # included routers are resolved lazily
                yield from walk(route.original_router, ancestors + getattr(container, "prefix", ""))

    seen: set[tuple[str, str]] = set()
    for path, methods in walk(create_app().router):
        for method in methods:
            assert (method, path) not in seen, f"duplicate route {method} {path}"
            seen.add((method, path))
    assert ("GET", "/api/v1/events") in seen and ("GET", "/api/v1/deadlines") in seen
    assert len(seen) > 60


async def test_event_end_time_and_test_alert_limit_only_counts_real_sends(client, sent):
    headers = await sign_in(client, sent, phone=PHONE)
    start = datetime.now(UTC) + timedelta(days=2)
    bad = await client.post("/api/v1/deadlines", headers=headers, json={
        "title": "x", "starts_at": start.isoformat(), "ends_at": (start - timedelta(hours=1)).isoformat()})
    assert bad.status_code == 422
    ok = await client.post("/api/v1/deadlines", headers=headers, json={
        "title": "Viva", "starts_at": start.isoformat(), "ends_at": (start + timedelta(hours=1)).isoformat()})
    assert ok.status_code == 201 and ok.json()["ends_at"]
