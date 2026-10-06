"""Gmail over its REST API with an async HTTP client (no blocking Google SDK calls)."""

import base64
import hashlib
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from html import unescape
from typing import Any
from urllib.parse import urlencode
from uuid import UUID

import httpx
import stamina

from app.core.config import get_settings
from app.core.http import get_http
from app.core.logging import log
from app.providers.base import ProviderError, ReauthRequired
from app.providers.mime import envelope_from_bytes, envelope_from_headers
from app.rules.envelope import Envelope

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
API = "https://gmail.googleapis.com/gmail/v1/users/me"
READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
SCOPES = [READ_SCOPE]
UPLOAD_API = "https://gmail.googleapis.com/upload/gmail/v1/users/me"
MAX_MESSAGES_PER_SYNC = 200


class _Retryable(Exception):
    pass


def pkce_pair(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def authorize_url(state: str, code_verifier: str, login_hint: str | None = None, *, send: bool = False) -> str:
    s = get_settings()
    params = {
        "client_id": s.google_client_id,
        "redirect_uri": s.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": " ".join([*SCOPES, *([SEND_SCOPE] if send else [])]),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
        "code_challenge": pkce_pair(code_verifier),
        "code_challenge_method": "S256",
    }
    if login_hint:
        params["login_hint"] = login_hint
    return f"{AUTH_URL}?{urlencode(params)}"


async def exchange_code(code: str, code_verifier: str) -> dict[str, Any]:
    s = get_settings()
    resp = await get_http().post(TOKEN_URL, data={
        "code": code,
        "client_id": s.google_client_id,
        "client_secret": s.google_client_secret.get_secret_value(),
        "redirect_uri": s.google_oauth_redirect_uri,
        "grant_type": "authorization_code",
        "code_verifier": code_verifier,
    })
    if resp.status_code != 200:
        raise ProviderError(f"Google token exchange failed ({resp.status_code})")
    data = resp.json()
    granted = set(data.get("scope", "").split())
    if not set(SCOPES) <= granted:
        raise ProviderError("Gmail read permission was not granted")
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token"),
        "expires_at": time.time() + int(data.get("expires_in", 3600)),
        "scopes": sorted(granted),
    }


def can_send(credentials: dict[str, Any]) -> bool:
    return SEND_SCOPE in credentials.get("scopes", [])


async def revoke(credentials: dict[str, Any]) -> None:
    token = credentials.get("refresh_token") or credentials.get("access_token")
    if token:
        try:
            await get_http().post(REVOKE_URL, data={"token": token})
        except httpx.HTTPError:
            log.warning("gmail_revoke_failed")


def web_url(address: str, message_id: str) -> str:
    return f"https://mail.google.com/mail/?authuser={address}#all/{message_id}"


class GmailSession:
    def __init__(self, mailbox_id: UUID, address: str, credentials: dict[str, Any]) -> None:
        self.mailbox_id = mailbox_id
        self.address = address
        self._creds = dict(credentials)
        self._settings = get_settings()

    @property
    def credentials(self) -> dict[str, Any]:
        return self._creds

    async def _token(self) -> str:
        if self._creds.get("expires_at", 0) - 120 > time.time():
            return self._creds["access_token"]
        await self._refresh()
        return self._creds["access_token"]

    async def _refresh(self) -> None:
        if not self._creds.get("refresh_token"):
            raise ReauthRequired("No refresh token stored; reconnect the mailbox")
        s = self._settings
        resp = await get_http().post(TOKEN_URL, data={
            "client_id": s.google_client_id,
            "client_secret": s.google_client_secret.get_secret_value(),
            "refresh_token": self._creds["refresh_token"],
            "grant_type": "refresh_token",
        })
        if resp.status_code in (400, 401) and "invalid_grant" in resp.text:
            raise ReauthRequired("Google access was revoked or expired")
        if resp.status_code != 200:
            raise ProviderError(f"Token refresh failed ({resp.status_code})")
        data = resp.json()
        self._creds["access_token"] = data["access_token"]
        self._creds["expires_at"] = time.time() + int(data.get("expires_in", 3600))
        if data.get("refresh_token"):
            self._creds["refresh_token"] = data["refresh_token"]

    async def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        refreshed = False
        resp: httpx.Response | None = None
        try:
            async for attempt in stamina.retry_context(
                on=(_Retryable, httpx.TransportError), attempts=4, wait_initial=0.5, wait_max=8
            ):
                with attempt:
                    token = await self._token()
                    resp = await get_http().request(
                        method, f"{API}{path}", headers={"Authorization": f"Bearer {token}"}, **kwargs
                    )
                    if resp.status_code == 401 and not refreshed:
                        refreshed = True
                        self._creds["expires_at"] = 0
                        raise _Retryable()
                    if resp.status_code == 429 or resp.status_code >= 500:
                        raise _Retryable()
        except (_Retryable, httpx.TransportError) as exc:
            raise ProviderError(f"Gmail unavailable for {method} {path}") from exc
        assert resp is not None
        if resp.status_code == 401:
            raise ReauthRequired("Gmail rejected the credentials")
        if resp.status_code == 403 and "insufficientPermissions" in resp.text:
            raise ReauthRequired("Gmail permission missing; reconnect the mailbox")
        return resp

    async def upload_send(self, raw_message: bytes) -> httpx.Response:
        """Send a full RFC 822 message (up to 35 MB) via the media upload endpoint."""
        token = await self._token()
        try:
            resp = await get_http().post(
                f"{UPLOAD_API}/messages/send", params={"uploadType": "media"}, content=raw_message,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "message/rfc822"}, timeout=120.0,
            )
        except httpx.HTTPError as exc:
            raise ProviderError(f"Gmail upload failed: {type(exc).__name__}") from exc
        if resp.status_code == 401:
            raise ReauthRequired("Gmail rejected the credentials")
        if resp.status_code == 403 and "insufficient" in resp.text.lower():
            raise ReauthRequired("Gmail send permission missing; reconnect with sending enabled")
        return resp

    async def profile(self) -> dict[str, Any]:
        resp = await self.request("GET", "/profile")
        if resp.status_code != 200:
            raise ProviderError(f"Gmail profile failed ({resp.status_code})")
        return resp.json()

    async def watch(self) -> dict[str, Any] | None:
        s = self._settings
        if not s.google_project_id:
            return None
        resp = await self.request("POST", "/watch", json={
            "topicName": f"projects/{s.google_project_id}/topics/{s.google_pubsub_topic}",
            "labelIds": ["INBOX"],
            "labelFilterBehavior": "INCLUDE",
        })
        if resp.status_code != 200:
            log.warning("gmail_watch_failed", status=resp.status_code, body=resp.text[:300])
            return None
        data = resp.json()
        return {
            "history_id": str(data["historyId"]),
            "expires_at": datetime.fromtimestamp(int(data["expiration"]) / 1000, UTC),
        }

    async def stop_watch(self) -> None:
        await self.request("POST", "/stop")

    async def fetch_new(self, cursor: dict[str, Any]) -> tuple[list[str], dict[str, Any]]:
        start = cursor.get("history_id")
        if not start:
            profile = await self.profile()
            return [], {"history_id": str(profile["historyId"])}
        ids: list[str] = []
        page_token: str | None = None
        latest = start
        while True:
            params = {"startHistoryId": start, "historyTypes": "messageAdded", "labelId": "INBOX",
                      "maxResults": 500}
            if page_token:
                params["pageToken"] = page_token
            resp = await self.request("GET", "/history", params=params)
            if resp.status_code == 404:
                log.warning("gmail_history_expired", mailbox_id=str(self.mailbox_id))
                return await self._recover()
            if resp.status_code != 200:
                raise ProviderError(f"Gmail history failed ({resp.status_code})")
            data = resp.json()
            latest = str(data.get("historyId", latest))
            for record in data.get("history", []):
                for added in record.get("messagesAdded", []):
                    msg = added.get("message", {})
                    labels = set(msg.get("labelIds", []))
                    if "DRAFT" in labels or "INBOX" not in labels:
                        continue
                    if msg.get("id") and msg["id"] not in ids:
                        ids.append(msg["id"])
            page_token = data.get("nextPageToken")
            if not page_token or len(ids) >= MAX_MESSAGES_PER_SYNC:
                break
        return ids[:MAX_MESSAGES_PER_SYNC], {"history_id": latest}

    async def _recover(self) -> tuple[list[str], dict[str, Any]]:
        """History is gone (too old): rescan the last day; dedup keeps this idempotent."""
        profile = await self.profile()
        ids = await self._list("in:inbox newer_than:1d", MAX_MESSAGES_PER_SYNC)
        return ids, {"history_id": str(profile["historyId"])}

    async def _list(self, query: str, limit: int) -> list[str]:
        resp = await self.request("GET", "/messages", params={"q": query, "maxResults": min(limit, 500)})
        if resp.status_code != 200:
            raise ProviderError(f"Gmail list failed ({resp.status_code})")
        return [m["id"] for m in resp.json().get("messages", [])][:limit]

    async def recent(self, limit: int) -> list[str]:
        return await self._list("in:inbox", limit)

    async def load(self, ref: str, *, full: bool) -> Envelope | None:
        fmt = "raw" if full else "metadata"
        resp = await self.request("GET", f"/messages/{ref}", params={"format": fmt})
        if resp.status_code == 404:
            return None
        if resp.status_code != 200:
            raise ProviderError(f"Gmail get failed ({resp.status_code})")
        data = resp.json()
        received = datetime.fromtimestamp(int(data.get("internalDate", 0)) / 1000, UTC)
        message_id = str(data["id"])
        snippet = unescape_snippet(data.get("snippet", ""))
        thread_id = data.get("threadId")
        link = web_url(self.address, message_id)
        if full:
            raw = base64.urlsafe_b64decode(data["raw"] + "=" * (-len(data["raw"]) % 4))
            return envelope_from_bytes(
                raw, mailbox_id=self.mailbox_id, message_id=message_id, received_at=received, snippet=snippet,
                thread_id=thread_id, web_url=link, full=True, snippet_chars=self._settings.snippet_chars,
            )
        pairs = [(h["name"], h["value"]) for h in data.get("payload", {}).get("headers", [])]
        return envelope_from_headers(
            pairs, mailbox_id=self.mailbox_id, message_id=message_id, received_at=received, snippet=snippet,
            thread_id=thread_id, web_url=link,
        )


def unescape_snippet(snippet: str) -> str:
    return unescape(snippet)


class GmailProvider:
    @asynccontextmanager
    async def open(
        self, mailbox_id: UUID, address: str, credentials: dict[str, Any]
    ) -> AsyncIterator[GmailSession]:
        yield GmailSession(mailbox_id, address, credentials)
