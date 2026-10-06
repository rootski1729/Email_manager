from redis.asyncio import Redis

from app.core.config import get_settings

_client: Redis | None = None


def get_redis() -> Redis:
    """Process-wide Redis client (one connection pool). Keys are namespaced by prefix, not DB number."""
    global _client
    if _client is None:
        _client = Redis.from_url(get_settings().redis_url, decode_responses=True, health_check_interval=30)
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
    _client = None


class Keys:
    """Every Redis key the app uses, in one place (see docs/DESIGN.md §9)."""

    @staticmethod
    def sync_pending(mailbox_id: object) -> str:
        return f"sync:pending:{mailbox_id}"

    @staticmethod
    def mailbox_lock(mailbox_id: object) -> str:
        return f"lock:mailbox:{mailbox_id}"

    @staticmethod
    def seen(mailbox_id: object, message_id: str) -> str:
        return f"seen:{mailbox_id}:{message_id}"

    @staticmethod
    def rules_version(user_id: object) -> str:
        return f"rules:ver:{user_id}"

    @staticmethod
    def otp(phone: str) -> str:
        return f"otp:{phone}"

    @staticmethod
    def otp_requests(phone: str) -> str:
        return f"rl:otp:{phone}"

    @staticmethod
    def ip_requests(ip: str) -> str:
        return f"rl:ip:{ip}"

    @staticmethod
    def oauth_state(state: str) -> str:
        return f"oauth:state:{state}"

    @staticmethod
    def events(user_id: object) -> str:
        return f"events:{user_id}"

    @staticmethod
    def stats(user_id: object, day: str) -> str:
        return f"stats:{user_id}:{day}"

    @staticmethod
    def preview(mailbox_id: object) -> str:
        return f"preview:{mailbox_id}"

    @staticmethod
    def dest_verify(destination_id: object) -> str:
        return f"verify:dest:{destination_id}"

    RATE_GLOBAL = "rl:waha:global"

    @staticmethod
    def rate_destination(destination_id: object) -> str:
        return f"rl:dest:{destination_id}"

    @staticmethod
    def rate_daily(user_id: object, day: str) -> str:
        return f"rl:daily:{user_id}:{day}"

    @staticmethod
    def compose_session(user_id: object) -> str:
        return f"compose:{user_id}"

    @staticmethod
    def inbound_seen(message_id: str) -> str:
        return f"wa:in:{message_id}"

    @staticmethod
    def outbound_text(digest: str) -> str:
        return f"wa:outhash:{digest}"

    @staticmethod
    def outbound_id(message_id: str) -> str:
        return f"wa:sent:{message_id}"

    @staticmethod
    def lid(lid: str) -> str:
        return f"wa:lid:{lid}"

    @staticmethod
    def ref_seq(user_id: object) -> str:
        return f"refseq:{user_id}"

    @staticmethod
    def suggestions(mailbox_id: object) -> str:
        return f"suggest:{mailbox_id}"

    @staticmethod
    def test_alerts(user_id: object) -> str:
        return f"rl:testalert:{user_id}"

    @staticmethod
    def rate_email(user_id: object, day: str) -> str:
        return f"rl:email:{user_id}:{day}"

    DISPATCHER_LEADER = "dispatcher:leader"
    DISPATCHER_WAKE = "dispatcher:wake"
    WAHA_HEALTH = "waha:health"
    WORKER_HEARTBEAT = "heartbeat:worker"
    LISTENER_HEARTBEAT = "heartbeat:gmail-listener"
