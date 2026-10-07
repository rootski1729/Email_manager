"""Reading emails like a person (new text vs thread vs forward) and laying them out for WhatsApp."""

from email.message import EmailMessage
from uuid import uuid4

from app.compose import commands as cmd
from app.notify import wa
from app.notify.templates import render_alert, render_batch
from app.providers.mime import attachment_parts, envelope_from_bytes
from app.providers.reading import read_email, thread_messages

GMAIL_REPLY = """Hi Asha,

We've moved your technical round to Friday 10 October at 3:00 PM IST.

Best regards,
Riya

On Tue, 6 Oct 2026 at 18:02, Asha Verma <
asha@gmail.com> wrote:
> Hi Riya,
> Thursday works for me.
>
> On Tue, 6 Oct 2026 at 11:40, Riya Sharma <riya@infosys.com> wrote:
>> Dear Asha, we'd like to invite you to an interview.
"""

OUTLOOK_REPLY = """Dear Asha,

Your slot is confirmed for 20 October.

Regards
Dr. Mehta

________________________________
From: Asha Verma <asha@akgec.ac.in>
Sent: Monday, October 5, 2026 9:12 PM
To: Dr. Mehta <mehta@akgec.ac.in>
Subject: Viva slots

Respected Sir, may I take the 11:30 slot?
"""

FORWARD = """See this, pay before due date.

---------- Forwarded message ---------
From: UPPCL Billing <noreply@uppcl.org>
Date: Mon, Oct 5, 2026 at 9:00 AM
Subject: Electricity bill October
To: <papa@gmail.com>

Dear Consumer,
Your bill of Rs 2,340 is due on 15 October 2026.
"""


def test_gmail_reply_splits_new_text_from_two_earlier_messages() -> None:
    reading = read_email(GMAIL_REPLY, subject="Re: Interview")
    assert reading.kind == "reply" and reading.earlier == 2
    assert reading.latest.startswith("Hi Asha") and "Thursday" not in reading.latest
    earlier = thread_messages(reading.history)
    assert [(m.sender, m.sent) for m in earlier] == [("Asha Verma", "Tue, 6 Oct 2026 at 18:02"),
                                                     ("Riya Sharma", "Tue, 6 Oct 2026 at 11:40")]
    assert earlier[0].text.startswith("Hi Riya") and ">" not in earlier[1].text


def test_outlook_reply_counts_one_earlier_message() -> None:
    reading = read_email(OUTLOOK_REPLY, subject="RE: Viva slots")
    assert reading.kind == "reply" and reading.earlier == 1
    assert "From:" not in reading.latest
    [earlier] = thread_messages(reading.history)
    assert earlier.sender == "Asha Verma" and earlier.sent.startswith("Monday") and "11:30" in earlier.text


def test_forward_keeps_the_note_and_the_original() -> None:
    reading = read_email(FORWARD, subject="Fwd: Electricity bill October")
    assert reading.kind == "forward"
    assert reading.latest == "See this, pay before due date."
    assert reading.forwarded_from == "UPPCL Billing" and reading.forwarded_subject == "Electricity bill October"
    assert reading.main_text.startswith("Dear Consumer") and "From:" not in reading.main_text


def test_plain_email_and_reply_by_header_only() -> None:
    assert read_email("Hello there.", subject="Hi").kind == "new"
    assert read_email("Sounds good.", subject="Plans", in_reply_to=True).kind == "reply"


def _raw(text: str, html: str | None = None, files: tuple = ()) -> bytes:
    m = EmailMessage()
    m["From"], m["To"], m["Subject"] = "Coursera <c@coursera.org>", "a@x.com", "Certificate"
    m.set_content(text)
    if html:
        m.add_alternative(html, subtype="html")
    for name, ctype, data in files:
        main, sub = ctype.split("/")
        m.add_attachment(data, maintype=main, subtype=sub, filename=name)
    return bytes(m)


def test_html_wins_over_a_stub_plain_part_and_attachments_keep_their_bytes() -> None:
    raw = _raw("Your certificate is ready.",
               "<h1>Congratulations, Asha!</h1><p>You've completed <b>Machine Learning</b>.</p>"
               "<ul><li>View certificate</li><li>Share it on LinkedIn</li></ul>",
               files=(("Date_Sheet.pdf", "application/pdf", b"%PDF-1"), ("image001.png", "image/png", b"x")))
    env = envelope_from_bytes(raw, mailbox_id=uuid4(), message_id="1", full=True, snippet_chars=100)
    assert "Congratulations, Asha!" in (env.body_text or "") and "Machine Learning." in (env.body_text or "")
    assert "• View certificate" in (env.body_text or "")
    parts = attachment_parts(raw)
    assert [(p.name, p.data) for p in parts] == [("Date_Sheet.pdf", b"%PDF-1"), ("image001.png", b"x")]


def test_whatsapp_helpers() -> None:
    assert wa.plain("Date_Sheet_2026.pdf *bold* _it_") == "Date_Sheet_2026.pdf ∗bold∗ ˍitˍ"
    assert wa.strip_prefixes("RE: Fwd: Viva slots") == "Viva slots"
    assert wa.quote("one\n\n\ntwo\nthree", max_chars=100) == "> one\n> two\n> three"
    assert wa.quote("word " * 100, max_chars=50).endswith("…")
    parts = wa.chunks(("para " * 300 + "\n\n") * 4, limit=1600)
    assert len(parts) > 2 and all(len(p) <= 1600 for p in parts)
    files = [{"name": "Date_Sheet.pdf", "type": "application/pdf", "size": 180_000},
             {"name": "image001.png", "type": "image/png", "size": 4_000},
             {"name": "Rules.docx", "type": "application/msword", "size": 40_000},
             {"name": "Map.pdf", "type": "application/pdf", "size": 1}]
    assert wa.files_line(files) == "📎 3 files: Date_Sheet.pdf, Rules.docx +1 more"


def test_alerts_for_replies_forwards_and_files() -> None:
    base = {"ref": "K7", "from_address": "riya@infosys.com", "from_name": "Riya Sharma", "rules": ["Jobs"],
            "snippet": "We've moved your round to Friday."}
    reply = render_alert({**base, "subject": "Re: Interview", "thread": {"kind": "reply", "earlier": 2}})
    assert reply.splitlines()[:3] == ["↩️ *Interview*", "*Riya Sharma* replied · riya@infosys.com",
                                      "🧵 _2 earlier messages in this thread_"]
    forward = render_alert({**base, "subject": "Fwd: Bill", "from_name": "Dad",
                            "thread": {"kind": "forward", "forwarded_from": "UPPCL", "note": "Pay this"}})
    assert "*Dad* forwarded an email from *UPPCL*" in forward and "💬 _Pay this_" in forward
    with_files = render_alert({**base, "subject": "Date sheet",
                               "attachments": [{"name": "Date_Sheet.pdf", "type": "application/pdf", "size": 9e4}]})
    assert "📎 1 file: Date_Sheet.pdf" in with_files
    batch = render_batch([{**base, "subject": "Re: Interview", "thread": {"kind": "reply"}}], "1 important email")
    assert "↩️ *Interview*  *#K7*" in batch


def test_help_lists_every_new_command() -> None:
    for command in ("/open K7", "/thread K7", "/files K7", "/ideas K7", "2 mention", "/reply K7 manual",
                    "/write", "/edit", "/remind K7 2h", "/mute K7", "/ask"):
        assert command in cmd.HELP
