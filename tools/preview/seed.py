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
    AppSetting, Destination, DestinationKind, Mailbox, Message, Provider, Rule, User, UserSettings,
)
from app.services import ingest  # noqa: E402
from app.services.auth import _issue  # noqa: E402

IMAP, SMTP = 53143, 53025


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
        for m in (await db.scalars(select(Message).where(Message.user_id == user_id).order_by(Message.ref))).all():
            print(f"#{m.ref}  /messages/{m.id}  {m.subject}")
        issued = await _issue(db, await db.get(User, user_id), family_id=uuid4(), user_agent="preview", ip=None)
        await db.commit()
    Path(token_file).write_text(issued.refresh_token)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
