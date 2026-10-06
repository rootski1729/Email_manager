"""Remember what the bot sends so its own echoes (fromMe webhooks) are never treated as commands."""

import hashlib

from app.core.redis import Keys, get_redis

OUTBOUND_GUARD_S = 15 * 60


def text_digest(chat_id: str, text: str) -> str:
    return hashlib.sha256(f"{chat_id}\n{text.strip()}".encode()).hexdigest()[:32]


async def remember_text(chat_id: str, text: str) -> None:
    """Call *before* sending: the echo webhook can arrive before sendText returns."""
    await get_redis().set(Keys.outbound_text(text_digest(chat_id, text)), "1", ex=OUTBOUND_GUARD_S)


async def remember_id(message_id: str) -> None:
    await get_redis().set(Keys.outbound_id(message_id), "1", ex=OUTBOUND_GUARD_S)


async def is_own_text(chat_id: str, text: str) -> bool:
    return bool(await get_redis().exists(Keys.outbound_text(text_digest(chat_id, text))))


async def is_own_id(message_id: str) -> bool:
    return bool(await get_redis().exists(Keys.outbound_id(message_id)))
