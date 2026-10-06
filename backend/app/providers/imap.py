"""Generic IMAP mailboxes (Outlook, Yahoo, Zoho, university servers, ...)."""

import re
import ssl
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

import aioimaplib
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.logging import log
from app.providers.base import ProviderError, ReauthRequired
from app.providers.mime import envelope_from_bytes
from app.rules.envelope import Envelope

MAX_MESSAGES_PER_SYNC = 200
MAX_FULL_BYTES = 8 * 1024 * 1024
_UIDVALIDITY = re.compile(rb"UIDVALIDITY (\d+)")
_UIDNEXT = re.compile(rb"UIDNEXT (\d+)")
_SIZE = re.compile(rb"RFC822\.SIZE (\d+)")


class ImapCredentials(BaseModel):
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(default=993, ge=1, le=65535)
    security: Literal["ssl", "plain"] = "ssl"
    username: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=1024)
    folder: str = Field(default="INBOX", max_length=255)
    # Optional SMTP for sending email from WhatsApp. Username/password default to the IMAP ones.
    smtp_host: str | None = Field(default=None, max_length=255)
    smtp_port: int = Field(default=465, ge=1, le=65535)
    smtp_security: Literal["ssl", "starttls", "plain"] = "ssl"
    smtp_username: str | None = Field(default=None, max_length=320)
    smtp_password: str | None = Field(default=None, max_length=1024)


PRESETS: dict[str, dict[str, Any]] = {
    "outlook": {"host": "outlook.office365.com", "port": 993, "security": "ssl",
                "smtp_host": "smtp.office365.com", "smtp_port": 587, "smtp_security": "starttls"},
    "yahoo": {"host": "imap.mail.yahoo.com", "port": 993, "security": "ssl",
              "smtp_host": "smtp.mail.yahoo.com", "smtp_port": 465, "smtp_security": "ssl"},
    "zoho": {"host": "imap.zoho.com", "port": 993, "security": "ssl",
             "smtp_host": "smtp.zoho.com", "smtp_port": 465, "smtp_security": "ssl"},
    "icloud": {"host": "imap.mail.me.com", "port": 993, "security": "ssl",
               "smtp_host": "smtp.mail.me.com", "smtp_port": 587, "smtp_security": "starttls"},
    "gmail-imap": {"host": "imap.gmail.com", "port": 993, "security": "ssl",
                   "smtp_host": "smtp.gmail.com", "smtp_port": 465, "smtp_security": "ssl"},
}


def _ok(resp: aioimaplib.Response) -> bool:
    return resp.result == "OK"


def _first_literal(lines: list[Any]) -> bytes | None:
    for line in lines:
        if isinstance(line, bytearray):
            return bytes(line)
    return None


class ImapSession:
    def __init__(self, mailbox_id: UUID, client: aioimaplib.IMAP4, creds: ImapCredentials,
                 uidvalidity: int, uidnext: int) -> None:
        self.mailbox_id = mailbox_id
        self._client = client
        self._creds = creds
        self.uidvalidity = uidvalidity
        self.uidnext = uidnext

    @property
    def credentials(self) -> dict[str, Any]:
        return self._creds.model_dump()

    async def _search(self, criteria: str) -> list[int]:
        resp = await self._client.uid_search(criteria, charset=None)
        if not _ok(resp):
            raise ProviderError(f"IMAP search failed: {resp.result}")
        uids: list[int] = []
        for line in resp.lines:
            if isinstance(line, bytes | bytearray) and re.fullmatch(rb"[\d ]+", line.strip() or b"x"):
                uids.extend(int(x) for x in line.split())
        return sorted(set(uids))

    async def fetch_new(self, cursor: dict[str, Any]) -> tuple[list[str], dict[str, Any]]:
        known_validity = cursor.get("uidvalidity")
        last_uid = int(cursor.get("last_uid", 0))
        if known_validity is None:
            # First sync: start from "now", don't alert on the existing inbox.
            last = self.uidnext - 1 if self.uidnext > 1 else max(await self._search("ALL"), default=0)
            return [], {"uidvalidity": self.uidvalidity, "last_uid": max(last, 0)}
        if int(known_validity) != self.uidvalidity:
            log.warning("imap_uidvalidity_changed", mailbox_id=str(self.mailbox_id))
            since = (datetime.now(UTC) - timedelta(days=1)).strftime("%d-%b-%Y")
            uids = await self._search(f"SINCE {since}")
        else:
            uids = [u for u in await self._search(f"UID {last_uid + 1}:*") if u > last_uid]
        uids = uids[:MAX_MESSAGES_PER_SYNC]
        new_last = max([last_uid if int(known_validity) == self.uidvalidity else 0, *uids])
        return [str(u) for u in uids], {"uidvalidity": self.uidvalidity, "last_uid": new_last}

    async def recent(self, limit: int) -> list[str]:
        start = max(self.uidnext - 1 - limit * 3, 1)
        uids = await self._search(f"UID {start}:*")
        return [str(u) for u in sorted(uids, reverse=True)[:limit]]

    async def load(self, ref: str, *, full: bool) -> Envelope | None:
        head = await self._client.uid("fetch", ref, "(UID RFC822.SIZE INTERNALDATE BODY.PEEK[HEADER])")
        if not _ok(head):
            raise ProviderError(f"IMAP fetch failed: {head.result}")
        header_bytes = _first_literal(head.lines)
        if header_bytes is None:
            return None
        meta = b" ".join(line for line in head.lines if isinstance(line, bytes))
        size_match = _SIZE.search(meta)
        size = int(size_match.group(1)) if size_match else 0
        raw = header_bytes
        is_full = False
        if full and size <= MAX_FULL_BYTES:
            body = await self._client.uid("fetch", ref, "(BODY.PEEK[])")
            raw_full = _first_literal(body.lines) if _ok(body) else None
            if raw_full:
                raw, is_full = raw_full, True
        return envelope_from_bytes(
            raw, mailbox_id=self.mailbox_id, message_id=ref, full=is_full,
            snippet_chars=get_settings().snippet_chars,
        )


async def _connect(creds: ImapCredentials) -> aioimaplib.IMAP4:
    settings = get_settings()
    timeout = settings.imap_timeout_s
    if creds.security == "ssl":
        client: aioimaplib.IMAP4 = aioimaplib.IMAP4_SSL(
            host=creds.host, port=creds.port, timeout=timeout, ssl_context=ssl.create_default_context()
        )
    else:
        if not settings.imap_allow_insecure:
            raise ProviderError("Unencrypted IMAP is disabled on this server")
        client = aioimaplib.IMAP4(host=creds.host, port=creds.port, timeout=timeout)
    try:
        await client.wait_hello_from_server()
    except (OSError, TimeoutError) as exc:
        raise ProviderError(f"Cannot reach {creds.host}:{creds.port}") from exc
    login = await client.login(creds.username, creds.password)
    if not _ok(login):
        await _safe_logout(client)
        raise ReauthRequired("IMAP login failed: check the username and app password")
    return client


async def _safe_logout(client: aioimaplib.IMAP4) -> None:
    try:
        await client.logout()
    except Exception:
        pass


class ImapProvider:
    @asynccontextmanager
    async def open(
        self, mailbox_id: UUID, address: str, credentials: dict[str, Any]
    ) -> AsyncIterator[ImapSession]:
        creds = ImapCredentials.model_validate(credentials)
        client = await _connect(creds)
        try:
            # SELECT (not EXAMINE: aioimaplib only tracks SELECT); every fetch uses BODY.PEEK so nothing is marked read.
            selected = await client.select(creds.folder)
            if not _ok(selected):
                raise ProviderError(f"Folder {creds.folder!r} not found")
            text = b" ".join(line for line in selected.lines if isinstance(line, bytes))
            validity = _UIDVALIDITY.search(text)
            uidnext = _UIDNEXT.search(text)
            if not validity:
                raise ProviderError("Server did not report UIDVALIDITY")
            yield ImapSession(mailbox_id, client, creds, int(validity.group(1)),
                              int(uidnext.group(1)) if uidnext else 1)
        finally:
            await _safe_logout(client)
