"""A reply in a thread, with attachments: the alert says so, /open, /thread and /files work, and the website
shows the full email and serves the files."""

import smtplib
from email.message import EmailMessage

from sqlalchemy import select

from app.core.db import session_factory
from app.models import Message, Notification, NotificationKind
from app.notify.dispatcher import Dispatcher
from app.services import compose, ingest
from tests.integration.test_engagement import last_reply, no_delay, notes, ready, wa  # noqa: F401  (fixtures)
from tests.integration.test_pipeline import FakeWaha

PDF = b"%PDF-1.7 date sheet " + bytes(range(256)) * 200
BODY = """Dear Asha,

Your viva is confirmed for 20 October at 11:30 AM in Lab 3. The date sheet and rules are attached.

Regards
Dr. Mehta

On Mon, 5 Oct 2026 at 21:12, Asha Verma <student@example.com> wrote:
> Respected Sir, may I take the 11:30 slot on 20 October?
"""


def send_reply_with_files(infra) -> None:
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = "Dr. Mehta <mehta@exam.univ.edu>", "student@example.com", "Re: Viva"
    msg["In-Reply-To"] = "<orig@univ.edu>"
    msg.set_content(BODY)
    msg.add_attachment(PDF, maintype="application", subtype="pdf", filename="Date_Sheet.pdf")
    msg.add_attachment(b"rules " * 5000, maintype="text", subtype="plain", filename="Viva rules.txt")
    msg.add_attachment(b"<script>x</script>" * 10, maintype="text", subtype="html", filename="page.html")
    with smtplib.SMTP(*infra["smtp"]) as s:
        s.send_message(msg)


async def test_reply_thread_with_files_on_whatsapp_and_the_website(client, ready, infra):  # noqa: F811
    headers, mailbox_id = ready
    send_reply_with_files(infra)
    await ingest.sync_mailbox(mailbox_id)
    async with session_factory()() as db:
        message = await db.scalar(select(Message))
    ref = message.ref

    waha = FakeWaha()
    await Dispatcher(waha=waha, sleep=False).tick()  # type: ignore[arg-type]
    [(_, alert)] = waha.sent
    assert alert.startswith("↩️ *Viva*\n*Dr. Mehta* replied · mehta@exam.univ.edu\n🧵 _1 earlier message")
    assert "> Your viva is confirmed for 20 October" in alert and "Respected Sir" not in alert
    assert "📎 3 files: Date_Sheet.pdf, Viva rules.txt +1 more" in alert

    assert await compose.handle_inbound(wa(f"/open {ref}")) == "open"
    opened = await last_reply()
    assert opened.startswith("📖 *Re: Viva*\n*From:* Dr. Mehta · mehta@exam.univ.edu")
    assert "Regards\nDr. Mehta" in opened and "Respected Sir" not in opened
    assert "📎 *Attachments (3)*\n1. Date_Sheet.pdf · 50 KB" in opened
    assert f"*/files {ref}* sends them here" in opened and f"*/thread {ref}* to read them" in opened

    assert await compose.handle_inbound(wa(f"/thread {ref}")) == "thread"
    thread = await last_reply()
    assert "*1. Asha Verma* · _Mon, 5 Oct 2026 at 21:12_\nRespected Sir, may I take the 11:30 slot" in thread

    assert await compose.handle_inbound(wa(f"/files {ref} 1")) == "files"
    sending, file_caption = [n.payload["text"] for n in (await notes(NotificationKind.reply))[-2:]]
    assert sending.startswith("📎 Sending 1 file from *Re: Viva*") and file_caption.startswith("📎 Date_Sheet.pdf")
    waha = FakeWaha()
    await Dispatcher(waha=waha, sleep=False).tick()  # type: ignore[arg-type]
    [(_, filename, data, caption)] = waha.files
    assert filename == "Date_Sheet.pdf" and data == PDF and caption == f"📎 Date_Sheet.pdf · from *#{ref}*"
    async with session_factory()() as db:
        file_note = await db.scalar(select(Notification).where(Notification.kind == NotificationKind.reply,
                                                               Notification.payload["file"].isnot(None)))
    assert "data" not in str(file_note.payload)  # the file itself never lands in the database

    # The website: the whole email, its thread and its files.
    content = (await client.get(f"/api/v1/messages/{message.id}/content", headers=headers)).json()
    assert content["kind"] == "reply" and content["text"].startswith("Dear Asha")
    assert content["thread"] == [{"sender": "Asha Verma", "sent": "Mon, 5 Oct 2026 at 21:12",
                                  "text": "Respected Sir, may I take the 11:30 slot on 20 October?"}]
    assert [a["name"] for a in content["attachments"]] == ["Date_Sheet.pdf", "Viva rules.txt", "page.html"]
    pdf = await client.get(f"/api/v1/messages/{message.id}/attachments/0", headers=headers)
    assert pdf.status_code == 200 and pdf.content == PDF and pdf.headers["content-type"] == "application/pdf"
    assert pdf.headers["content-disposition"].startswith('attachment; filename="Date_Sheet.pdf"')
    html = await client.get(f"/api/v1/messages/{message.id}/attachments/2", headers=headers)
    assert html.headers["content-type"] == "application/octet-stream"  # never rendered by the browser
    assert (await client.get(f"/api/v1/messages/{message.id}/attachments/9", headers=headers)).status_code == 404
