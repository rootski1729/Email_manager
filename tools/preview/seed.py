"""Seed the local preview: a demo user "Asha" with a real IMAP mailbox (GreenMail) holding the sample emails,
synced through the real pipeline, with AI pointed at mock_ai.py. Writes a sign-in token to argv[1].

Run from backend/:  PYTHONPATH=. uv run python ../tools/preview/seed.py <token-file>
"""

import asyncio
import smtplib
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).parent))
from samples import SAMPLES  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.core.db import session_factory  # noqa: E402
from app.core.runtime import AI_KEY  # noqa: E402
from app.core.security import vault  # noqa: E402
from app.models import (  # noqa: E402
    AppSetting, Destination, DestinationKind, Mailbox, Message, Notification, NotificationKind, NotificationStatus,
    OutboundEmail, OutboundStatus, Provider, Rule, RuleMatch, User, UserSettings,
)
from app.services import ingest  # noqa: E402
from app.services.auth import _issue  # noqa: E402

IMAP, SMTP = 53143, 53025

# Two weeks of history so the dashboard's charts have something to show (list-only: these emails aren't in
# the local mailbox, so opening one says it no longer exists).
HISTORY_SENDERS = [
    ("Exam Cell", "exams@akgec.ac.in", "Exams"), ("Training & Placement", "tnp@akgec.ac.in", "Jobs"),
    ("HDFC Bank", "alerts@hdfcbank.net", "Bank & payments"), ("Riya Sharma", "riya@infosys.com", "Jobs"),
    ("IndiGo", "noreply@goindigo.in", "Travel"), ("Prof. R. Mehta", "mehta@akgec.ac.in", "Exams"),
]
HISTORY_SUBJECTS = {"Exams": ["Revised date sheet", "Internal marks uploaded", "Re-exam form open"],
                    "Jobs": ["Campus drive: shortlist", "Interview slot confirmed", "Offer letter"],
                    "Bank & payments": ["Credit card statement", "UPI payment received", "Fee receipt"],
                    "Travel": ["Booking confirmed", "Web check-in open", "Flight time changed"]}


async def add_history(db, user_id, mailbox_id, now) -> None:  # noqa: ANN001
    import random
    from datetime import timedelta

    rng = random.Random(7)
    for day in range(1, 15):
        for n in range(rng.randint(1, 5) if day > 1 else 2):
            name, address, rule = HISTORY_SENDERS[rng.randrange(len(HISTORY_SENDERS))]
            at = now - timedelta(days=day, hours=rng.randint(0, 20), minutes=rng.randint(0, 59))
            m = Message(id=uuid4(), user_id=user_id, mailbox_id=mailbox_id, provider_message_id=f"demo-{day}-{n}",
                        from_address=address, from_name=name, to_addresses=["asha@gmail.com"],
                        subject=rng.choice(HISTORY_SUBJECTS[rule]), snippet="(demo history)", received_at=at,
                        headers={}, ai_summary="Demo summary." if rng.random() < 0.7 else None)
            db.add(m)
            await db.flush()
            db.add(RuleMatch(message_id=m.id, rule_name=rule))
            status = rng.choice([NotificationStatus.read] * 3 + [NotificationStatus.delivered,
                                                                 NotificationStatus.sent])
            db.add(Notification(user_id=user_id, kind=NotificationKind.alert, status=status,
                                chat_id="919812345678@c.us", payload={"subject": m.subject}, message_id=m.id,
                                dedupe_key=f"demo-{m.id}", created_at=at, next_attempt_at=at, sent_at=at))
        if rng.random() < 0.4:
            at = now - timedelta(days=day, hours=3)
            db.add(OutboundEmail(user_id=user_id, mailbox_id=mailbox_id, from_address="asha@gmail.com",
                                 to_addresses=["office@akgec.ac.in"], cc_addresses=[], bcc_addresses=[],
                                 subject="Leave request", body="Demo", status=OutboundStatus.sent, sent_at=at,
                                 created_at=at))


async def main(token_file: str) -> None:
    now = datetime.now(UTC)
    async with session_factory()() as db:
        user = User(id=uuid4(), phone_e164="+919812345678", display_name="Asha Verma", timezone="Asia/Kolkata",
                    email="asha@gmail.com", last_login_at=now)
        db.add(user)
        await db.flush()
        db.add(UserSettings(user_id=user.id))
        db.add(Destination(user_id=user.id, kind=DestinationKind.whatsapp_self, chat_id="919812345678@c.us",
                           label="My WhatsApp", verified_at=now, is_default=True))
        mailbox = Mailbox(id=uuid4(), user_id=user.id, provider=Provider.imap, address="asha@gmail.com",
                          display_name="Personal", can_send=True, credentials=vault().encrypt_json({
                              "host": "127.0.0.1", "port": IMAP, "security": "plain", "username": "asha@gmail.com",
                              "password": "x", "smtp_host": "127.0.0.1", "smtp_port": SMTP, "smtp_security": "plain"}))
        db.add(mailbox)
        for i, topic in enumerate(["Exams", "Jobs", "Bank & payments", "Travel"], 1):
            db.add(Rule(id=uuid4(), user_id=user.id, name=topic, position=i, condition={
                "field": "subject", "op": "contains", "value": [topic.split()[0].lower()]}))
        db.add(Rule(id=uuid4(), user_id=user.id, name="Important", position=0, condition={
            "field": "from.domain", "op": "domain_matches",
            "value": ["infosys.com", "akgec.ac.in", "gmail.com", "coursera.org", "github.com"]}))
        db.add(AppSetting(key=AI_KEY, value={"endpoint": "http://127.0.0.1:9911/v1", "model": "mock", "enabled": True},
                          secret=vault().encrypt_json({"api_key": "preview"})))
        await db.commit()
        mailbox_id, user_id = mailbox.id, user.id
    await ingest.sync_mailbox(mailbox_id)  # baseline: older mail is skipped
    with smtplib.SMTP("127.0.0.1", SMTP) as smtp:
        for raw in SAMPLES.values():
            smtp.sendmail("sender@example.com", ["asha@gmail.com"], raw)
    await asyncio.sleep(1)
    await ingest.sync_mailbox(mailbox_id)
    async with session_factory()() as db:
        await add_history(db, user_id, mailbox_id, datetime.now(UTC))
        await db.commit()
        for m in (await db.scalars(select(Message).where(Message.user_id == user_id, Message.ref.is_not(None)).order_by(Message.ref))).all():
            print(f"#{m.ref}  /messages/{m.id}  {m.subject}")
        issued = await _issue(db, await db.get(User, user_id), family_id=uuid4(), user_agent="preview", ip=None)
        await db.commit()
    Path(token_file).write_text(issued.refresh_token)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
