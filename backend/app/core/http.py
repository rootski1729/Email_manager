import httpx

_client: httpx.AsyncClient | None = None


def get_http() -> httpx.AsyncClient:
    """Shared outbound HTTP client (connection pooling across Gmail/WAHA/Turnstile calls)."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(20.0, connect=5.0),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            headers={"User-Agent": "MailSentinel/0.1"},
        )
    return _client


async def close_http() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
    _client = None
