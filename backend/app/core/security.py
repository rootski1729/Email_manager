import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import jwt
import phonenumbers
from cryptography.fernet import Fernet, MultiFernet

from app.core.config import get_settings

JWT_ALG = "HS256"


def create_access_token(user_id: UUID, role: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(seconds=settings.access_token_ttl_s),
    }
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm=JWT_ALG)


def create_admin_token(admin_id: UUID) -> str:
    """A different token type: a client's token can never open the admin API, and vice versa."""
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {"sub": str(admin_id), "type": "admin", "iat": now,
               "exp": now + timedelta(seconds=settings.admin_access_ttl_s)}
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm=JWT_ALG)


def decode_admin_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret.get_secret_value(), algorithms=[JWT_ALG],
                             options={"require": ["exp", "sub", "type"]})
    except jwt.PyJWTError:
        return None
    return payload if payload.get("type") == "admin" else None


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(
            token, get_settings().jwt_secret.get_secret_value(), algorithms=[JWT_ALG],
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.PyJWTError:
        return None
    return payload if payload.get("type") == "access" else None


def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def keyed_hash(value: str) -> str:
    """HMAC with the server secret: used for OTP codes so a Redis dump doesn't reveal them."""
    key = get_settings().jwt_secret.get_secret_value().encode()
    return hmac.new(key, value.encode(), hashlib.sha256).hexdigest()


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


class Vault:
    """Encrypts mailbox credentials. ENCRYPTION_KEYS[0] encrypts; every key can decrypt (rotation)."""

    def __init__(self, keys: list[str]) -> None:
        if not keys:
            raise RuntimeError("ENCRYPTION_KEYS is not set; generate one with `make key`")
        self._fernet = MultiFernet([Fernet(k.encode()) for k in keys])

    def encrypt_json(self, data: dict[str, Any]) -> bytes:
        return self._fernet.encrypt(json.dumps(data).encode())

    def decrypt_json(self, token: bytes) -> dict[str, Any]:
        return json.loads(self._fernet.decrypt(bytes(token)))


_vault: Vault | None = None


def vault() -> Vault:
    global _vault
    if _vault is None:
        _vault = Vault(get_settings().encryption_keys)
    return _vault


def normalize_phone(raw: str) -> str | None:
    """Return the E.164 form of a phone number, or None if it isn't a valid number."""
    try:
        parsed = phonenumbers.parse(raw, None)
    except phonenumbers.NumberParseException:
        return None
    if not phonenumbers.is_valid_number(parsed):
        return None
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def phone_to_chat_id(phone_e164: str) -> str:
    return f"{phone_e164.lstrip('+')}@c.us"
