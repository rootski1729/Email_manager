from datetime import datetime

import pytest

from app.compose import commands as cmd
from app.compose.mailer import OutgoingFile, build_message
from app.services.compose import chat_to_phone

FORM = """/send
From: me@gmail.com
To: prof@univ.edu, Office@Univ.edu; prof@univ.edu
Cc: hod@univ.edu
Bcc:
Subject: Leave application
Body:
Dear Sir,

Please grant leave.
Subject: this line is body text, not a header"""


@pytest.mark.parametrize(
    ("text", "kind", "arg"),
    [
        ("/email", cmd.Kind.email, ""),
        ("/email Leave ", cmd.Kind.email, "leave"),
        ("/mail exam", cmd.Kind.email, "exam"),
        ("/templates", cmd.Kind.templates, ""),
        ("/SEND\nTo: a@b.com", cmd.Kind.send, ""),
        ("YES", cmd.Kind.confirm, ""),
        ("no", cmd.Kind.cancel, ""),
        ("/cancel", cmd.Kind.cancel, ""),
        ("/help", cmd.Kind.help, ""),
        ("/foo", cmd.Kind.unknown_command, "/foo"),
        ("yes please", cmd.Kind.text, ""),
        ("", cmd.Kind.text, ""),
    ],
)
def test_parse_command(text, kind, arg):
    command = cmd.parse_command(text)
    assert command.kind == kind
    assert command.arg == arg


def test_parse_full_form():
    draft = cmd.parse_draft(FORM, max_recipients=50)
    assert draft.errors == []
    assert draft.from_address == "me@gmail.com"
    assert draft.to == ["prof@univ.edu", "Office@univ.edu"]  # deduped, domain normalised
    assert draft.cc == ["hod@univ.edu"] and draft.bcc == []
    assert draft.subject == "Leave application"
    assert draft.body.startswith("Dear Sir,\n\nPlease grant leave.")
    assert draft.body.endswith("Subject: this line is body text, not a header")


def test_parse_tolerates_whatsapp_bold_and_inline_body():
    draft = cmd.parse_draft("/send\n*To:* a@b.com\n*Subject:* Hi\nBody: one line", max_recipients=5)
    assert draft.errors == [] and draft.to == ["a@b.com"] and draft.subject == "Hi" and draft.body == "one line"


def test_parse_reports_problems():
    draft = cmd.parse_draft("/send\nTo: not-an-email\nrandom words\nSubject: x", max_recipients=5)
    assert any("not a valid email" in e for e in draft.errors)
    assert any("don't understand" in e for e in draft.errors)
    assert any("at least one address" in e for e in draft.errors)
    many = "/send\nTo: " + ", ".join(f"u{i}@x.com" for i in range(6)) + "\nBody:\nhi"
    assert any("At most 5" in e for e in cmd.parse_draft(many, max_recipients=5).errors)


def test_rendered_form_parses_back():
    values = cmd.TemplateValues(from_address="me@gmail.com", to=["a@b.com"], cc=[], bcc=["c@d.com"],
                                subject="Report {{date}}", body="Line 1\nLine 2")
    draft = cmd.parse_draft(cmd.render_form(values), max_recipients=10)
    assert draft.errors == []
    assert (draft.from_address, draft.to, draft.bcc, draft.body) == ("me@gmail.com", ["a@b.com"], ["c@d.com"],
                                                                     "Line 1\nLine 2")


def test_placeholders():
    now = datetime(2026, 10, 5, 9, 30)
    assert cmd.fill_placeholders("{{date}} {{ time }} {{name}} {{other}}", now=now, name="Asha") == \
        "05 Oct 2026 09:30 Asha {{other}}"


@pytest.mark.parametrize(
    ("chat", "phone"),
    [("919876543210@c.us", "+919876543210"), ("14155550123@s.whatsapp.net", "+14155550123"),
     ("14155550123:12@s.whatsapp.net", "+14155550123"), ("123@g.us", None), ("abc@lid", None), (None, None)],
)
def test_chat_to_phone(chat, phone):
    assert chat_to_phone(chat) == phone


def test_build_message_with_attachment_has_no_bcc_header():
    msg = build_message(from_address="me@gmail.com", from_name="Me", to=["a@b.com"], cc=["c@d.com"],
                        subject="Hi", body="Hello", files=[OutgoingFile("scan.pdf", "application/pdf", b"%PDF-1")])
    assert msg["From"] == "Me <me@gmail.com>" and msg["Cc"] == "c@d.com" and msg["Bcc"] is None
    assert msg["Message-ID"].endswith("@gmail.com>")
    attachments = list(msg.iter_attachments())
    assert [a.get_filename() for a in attachments] == ["scan.pdf"]
    assert attachments[0].get_content() == b"%PDF-1"


async def test_gmail_send_uses_upload_endpoint_and_keeps_bcc_for_gmail():
    import time
    from email import message_from_bytes, policy
    from uuid import uuid4

    import httpx
    import respx

    from app.compose.mailer import SendError, send_gmail
    from app.providers.base import ReauthRequired
    from app.providers.gmail import GmailSession

    session = GmailSession(uuid4(), "me@gmail.com", {"access_token": "tok", "expires_at": time.time() + 3600})
    msg = build_message(from_address="me@gmail.com", from_name=None, to=["a@b.com"], cc=[], subject="Hi",
                        body="Hello", files=[])
    url = "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send"
    with respx.mock:
        route = respx.post(url, params={"uploadType": "media"}).mock(
            return_value=httpx.Response(200, json={"id": "18f00"}))
        assert await send_gmail(session, msg, ["secret@x.com"]) == "18f00"
        request = route.calls.last.request
        assert request.headers["authorization"] == "Bearer tok"
        assert request.headers["content-type"] == "message/rfc822"
        sent = message_from_bytes(request.content, policy=policy.default)
        assert sent["Bcc"] == "secret@x.com" and sent["To"] == "a@b.com"  # Gmail strips Bcc on delivery

        respx.post(url, params={"uploadType": "media"}).mock(return_value=httpx.Response(503, text="busy"))
        with pytest.raises(SendError) as err:
            await send_gmail(session, build_message(from_address="me@gmail.com", from_name=None, to=["a@b.com"],
                                                    cc=[], subject="x", body="y", files=[]), [])
        assert err.value.retryable

        respx.post(url, params={"uploadType": "media"}).mock(
            return_value=httpx.Response(403, text="Request had insufficient authentication scopes"))
        with pytest.raises(ReauthRequired):
            await send_gmail(session, build_message(from_address="me@gmail.com", from_name=None, to=["a@b.com"],
                                                    cc=[], subject="x", body="y", files=[]), [])
