"""Thin async client for WAHA (WhatsApp HTTP API)."""

import secrets
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.core.config import get_settings
from app.core.http import get_http
from app.core.logging import log


class WahaError(Exception):
    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


def _message_id(data: Any) -> str | None:
    if isinstance(data, dict):
        mid = data.get("id")
        if isinstance(mid, str):
            return mid
        if isinstance(mid, dict):
            return mid.get("_serialized") or mid.get("id")
        key = data.get("key")
        if isinstance(key, dict):
            return key.get("id")
    return None


class WahaClient:
    def __init__(self) -> None:
        s = get_settings()
        self.base = s.waha_url.rstrip("/")
        self.session = s.waha_session
        self.dry_run = s.waha_dry_run
        self._headers = {"X-Api-Key": s.waha_api_key.get_secret_value(), "Accept": "application/json"}

    async def _call(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            kwargs.setdefault("timeout", 30.0)
            return await get_http().request(method, f"{self.base}{path}", headers=self._headers, **kwargs)
        except httpx.TimeoutException as exc:
            raise WahaError("WAHA timed out", retryable=True) from exc
        except httpx.TransportError as exc:
            raise WahaError(f"WAHA unreachable: {type(exc).__name__}", retryable=True) from exc

    async def session_info(self) -> dict[str, Any]:
        if self.dry_run:
            return {"name": self.session, "status": "WORKING", "me": {"id": "dry-run"}, "dry_run": True}
        resp = await self._call("GET", f"/api/sessions/{self.session}")
        if resp.status_code == 404:
            return {"name": self.session, "status": "MISSING"}
        if resp.status_code != 200:
            raise WahaError(f"session status failed ({resp.status_code})", retryable=True)
        return resp.json()

    async def start_session(self) -> None:
        if self.dry_run:
            return
        resp = await self._call("POST", f"/api/sessions/{self.session}/start")
        if resp.status_code == 404:
            resp = await self._call("POST", "/api/sessions", json={"name": self.session, "start": True})
        if resp.status_code >= 400 and resp.status_code != 422:  # 422 = already started
            raise WahaError(f"start session failed ({resp.status_code})", retryable=False)

    async def restart_session(self) -> None:
        if not self.dry_run:
            await self._call("POST", f"/api/sessions/{self.session}/restart")

    async def stop_session(self) -> None:
        if not self.dry_run:
            await self._call("POST", f"/api/sessions/{self.session}/stop")

    async def logout_session(self) -> None:
        if not self.dry_run:
            await self._call("POST", f"/api/sessions/{self.session}/logout")

    async def qr_code(self) -> dict[str, str] | None:
        """QR for pairing as {mimetype, data(base64)}; None when the session isn't waiting for a scan."""
        if self.dry_run:
            return None
        resp = await self._call("GET", f"/api/{self.session}/auth/qr", params={"format": "image"})
        if resp.status_code != 200:
            return None
        data = resp.json()
        return {"mimetype": data.get("mimetype", "image/png"), "data": data.get("data", "")}

    async def check_exists(self, phone_e164: str) -> str | None:
        """Return the WhatsApp chat id for a phone number, or None if it has no WhatsApp."""
        if self.dry_run:
            return f"{phone_e164.lstrip('+')}@c.us"
        resp = await self._call(
            "GET", "/api/contacts/check-exists",
            params={"phone": phone_e164.lstrip("+"), "session": self.session},
        )
        if resp.status_code != 200:
            raise WahaError(f"check-exists failed ({resp.status_code})", retryable=True)
        data = resp.json()
        return data.get("chatId") if data.get("numberExists") else None

    async def phone_for_lid(self, lid: str) -> str | None:
        """Resolve a hidden `...@lid` id to a phone chat id (`...@c.us`)."""
        if self.dry_run:
            return None
        resp = await self._call("GET", f"/api/{self.session}/lids/{lid}")
        if resp.status_code != 200:
            return None
        pn = resp.json().get("pn")
        return pn if isinstance(pn, str) and pn else None

    async def download_media(self, url: str, max_bytes: int) -> bytes:
        """Fetch a received file. WAHA builds URLs from its own base URL, so re-target them at WAHA_URL."""
        parts = urlsplit(url)
        target = f"{self.base}{parts.path}" + (f"?{parts.query}" if parts.query else "")
        try:
            async with get_http().stream("GET", target, headers=self._headers, timeout=60.0) as resp:
                if resp.status_code != 200:
                    raise WahaError(f"media download failed ({resp.status_code})", retryable=resp.status_code >= 500)
                chunks: list[bytes] = []
                size = 0
                async for chunk in resp.aiter_bytes():
                    size += len(chunk)
                    if size > max_bytes:
                        raise WahaError("file is too large", retryable=False)
                    chunks.append(chunk)
                return b"".join(chunks)
        except httpx.HTTPError as exc:
            raise WahaError(f"media download failed: {type(exc).__name__}", retryable=True) from exc

    async def typing(self, chat_id: str, on: bool) -> None:
        if self.dry_run:
            return
        path = "/api/startTyping" if on else "/api/stopTyping"
        try:
            await self._call("POST", path, json={"session": self.session, "chatId": chat_id})
        except WahaError:
            pass  # cosmetic only

    async def send_text(self, chat_id: str, text: str) -> str:
        if self.dry_run:
            log.info("waha_dry_run_send", chat_id=chat_id, text=text)
            return f"dry_{secrets.token_hex(8)}"
        resp = await self._call(
            "POST", "/api/sendText",
            json={"session": self.session, "chatId": chat_id, "text": text, "linkPreview": False},
        )
        if resp.status_code in (200, 201):
            return _message_id(resp.json()) or f"unknown_{secrets.token_hex(6)}"
        # WAHA answers 422 "Session status is not as expected" while the session (re)connects.
        session_not_ready = resp.status_code == 422 and "Session status" in resp.text
        retryable = session_not_ready or resp.status_code in (408, 409, 425, 429) or resp.status_code >= 500
        raise WahaError(f"sendText failed ({resp.status_code}): {resp.text[:200]}", retryable=retryable)

    async def send_file(self, chat_id: str, *, data_b64: str, filename: str, mimetype: str, caption: str) -> str:
        """Send a document (an email attachment). WAHA Core supports media since 2026.6."""
        if self.dry_run:
            log.info("waha_dry_run_file", chat_id=chat_id, filename=filename, caption=caption)
            return f"dry_{secrets.token_hex(8)}"
        resp = await self._call(
            "POST", "/api/sendFile",
            json={"session": self.session, "chatId": chat_id, "caption": caption,
                  "file": {"mimetype": mimetype or "application/octet-stream", "filename": filename, "data": data_b64}},
            timeout=120.0,
        )
        if resp.status_code in (200, 201):
            return _message_id(resp.json()) or f"unknown_{secrets.token_hex(6)}"
        session_not_ready = resp.status_code == 422 and "Session status" in resp.text
        retryable = session_not_ready or resp.status_code in (408, 409, 425, 429) or resp.status_code >= 500
        raise WahaError(f"sendFile failed ({resp.status_code}): {resp.text[:200]}", retryable=retryable)
