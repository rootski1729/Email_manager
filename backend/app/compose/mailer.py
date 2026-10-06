"""Build RFC 5322 messages and send them through the user's own mailbox (Gmail API or SMTP)."""

from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from typing import Any

import aiosmtplib

from app.core.config import get_settings
from app.providers.gmail import GmailSession
from app.providers.imap import ImapCredentials


class SendError(Exception):
    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


@dataclass(frozen=True, slots=True)
class OutgoingFile:
    filename: str
    mime_type: str
    content: bytes


def build_message(
    *, from_address: str, from_name: str | None, to: list[str], cc: list[str], subject: str, body: str,
    files: list[OutgoingFile],
) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr((from_name or "", from_address))
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=False, usegmt=True)
    msg["Message-ID"] = make_msgid(domain=from_address.rsplit("@", 1)[-1])
    msg["X-Mailer"] = "MailSentinel"
    msg.set_content(body or " ")
    for f in files:
        maintype, _, subtype = (f.mime_type or "application/octet-stream").partition("/")
        msg.add_attachment(f.content, maintype=maintype or "application", subtype=subtype or "octet-stream",
                           filename=f.filename)
    return msg


async def send_gmail(session: GmailSession, msg: EmailMessage, bcc: list[str]) -> str:
    """Upload endpoint (media) supports messages up to 35 MB. Gmail strips the Bcc header itself."""
    if bcc:
        msg["Bcc"] = ", ".join(bcc)
    resp = await session.upload_send(msg.as_bytes())
    if resp.status_code in (200, 201):
        return str(resp.json().get("id", ""))
    retryable = resp.status_code == 429 or resp.status_code >= 500
    raise SendError(f"Gmail refused the message ({resp.status_code}): {resp.text[:200]}", retryable=retryable)


async def send_smtp(credentials: dict[str, Any], msg: EmailMessage, recipients: list[str]) -> str:
    creds = ImapCredentials.model_validate(credentials)
    if not creds.smtp_host:
        raise SendError("This mailbox has no SMTP settings", retryable=False)
    settings = get_settings()
    if creds.smtp_security == "plain" and not settings.imap_allow_insecure:
        raise SendError("Unencrypted SMTP is disabled on this server", retryable=False)
    try:
        await aiosmtplib.send(
            msg, recipients=recipients, hostname=creds.smtp_host, port=creds.smtp_port,
            username=creds.smtp_username or creds.username, password=creds.smtp_password or creds.password,
            use_tls=creds.smtp_security == "ssl", start_tls=creds.smtp_security == "starttls",
            timeout=settings.smtp_timeout_s,
        )
    except aiosmtplib.SMTPAuthenticationError as exc:
        raise SendError("SMTP login failed: update the mailbox's app password", retryable=False) from exc
    except aiosmtplib.SMTPRecipientsRefused as exc:
        raise SendError(f"The server refused the recipients: {exc}", retryable=False) from exc
    except (aiosmtplib.SMTPException, OSError, TimeoutError) as exc:
        raise SendError(f"SMTP error: {exc}", retryable=True) from exc
    return str(msg["Message-ID"])


async def verify_smtp(credentials: ImapCredentials) -> None:
    """Log in to the SMTP server without sending anything (used when connecting a mailbox)."""
    settings = get_settings()
    if credentials.smtp_security == "plain" and not settings.imap_allow_insecure:
        raise SendError("Unencrypted SMTP is disabled on this server", retryable=False)
    client = aiosmtplib.SMTP(
        hostname=credentials.smtp_host, port=credentials.smtp_port, timeout=settings.smtp_timeout_s,
        use_tls=credentials.smtp_security == "ssl", start_tls=credentials.smtp_security == "starttls",
    )
    try:
        await client.connect()
        user = credentials.smtp_username or credentials.username
        password = credentials.smtp_password or credentials.password
        if client.supports_extension("auth"):
            await client.login(user, password)
    except aiosmtplib.SMTPAuthenticationError as exc:
        raise SendError("SMTP login failed: check the username and app password", retryable=False) from exc
    except (aiosmtplib.SMTPException, OSError, TimeoutError) as exc:
        raise SendError(f"Cannot reach the SMTP server: {exc}", retryable=True) from exc
    finally:
        if client.is_connected:
            try:
                await client.quit()
            except aiosmtplib.SMTPException:
                client.close()
