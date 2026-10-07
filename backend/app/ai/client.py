"""Minimal client for Azure AI Foundry / Azure OpenAI (the OpenAI-compatible v1 API)."""

import json
from typing import Any
from urllib.parse import urlsplit

import httpx
import stamina

from app.core.config import get_settings
from app.core.http import get_http
from app.core.logging import log
from app.core.runtime import AIConfig, ai_config


class AIUnavailable(Exception):
    """AI is switched off, not configured, or the model call failed. Callers fall back to non-AI behaviour."""


class _Retry(Exception):
    pass


def normalize_endpoint(endpoint: str) -> str:
    """Accept what the Azure portal shows and turn it into the v1 base URL.

    https://x.openai.azure.com/                -> https://x.openai.azure.com/openai/v1
    https://x.services.ai.azure.com/models     -> https://x.services.ai.azure.com/openai/v1
    https://x.cognitiveservices.azure.com      -> https://x.cognitiveservices.azure.com/openai/v1
    Anything else (another OpenAI-compatible server) is used as given.
    """
    endpoint = endpoint.strip().rstrip("/")
    if not endpoint:
        return ""
    parts = urlsplit(endpoint)
    host = parts.netloc.lower()
    if host.endswith((".openai.azure.com", ".services.ai.azure.com", ".cognitiveservices.azure.com")):
        return f"{parts.scheme or 'https'}://{parts.netloc}/openai/v1"
    return endpoint


def _headers(config: AIConfig) -> dict[str, str]:
    if "azure.com" in urlsplit(config.endpoint).netloc:
        return {"api-key": config.api_key}
    return {"Authorization": f"Bearer {config.api_key}"}


async def complete(
    messages: list[dict[str, str]], *, json_mode: bool = True, max_tokens: int = 700,
    config: AIConfig | None = None,
) -> str:
    config = config or await ai_config()
    if not config.ready:
        raise AIUnavailable("AI is not configured")
    body: dict[str, Any] = {"model": config.model, "messages": messages, "max_completion_tokens": max_tokens}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    url = f"{normalize_endpoint(config.endpoint)}/chat/completions"
    resp: httpx.Response | None = None
    try:
        async for attempt in stamina.retry_context(on=(_Retry, httpx.TransportError), attempts=3,
                                                   wait_initial=1.0, wait_max=8.0):
            with attempt:
                resp = await get_http().post(url, json=body, headers=_headers(config),
                                             timeout=get_settings().ai_timeout_s)
                if resp.status_code == 429 or resp.status_code >= 500:
                    raise _Retry()
    except (_Retry, httpx.TransportError) as exc:
        raise AIUnavailable("The AI service is busy or unreachable") from exc
    assert resp is not None
    if resp.status_code != 200:
        code, detail = "", ""
        try:
            error = resp.json().get("error", {})
            code, detail = str(error.get("code") or ""), str(error.get("message") or "")
        except (ValueError, AttributeError):
            pass
        log.warning("ai_call_failed", status=resp.status_code, code=code, detail=detail[:300])
        if code == "content_filter":
            # Azure's safety filter (e.g. Prompt Shields spotting instructions hidden in an email).
            raise AIUnavailable("Azure's safety filter declined this email")
        raise AIUnavailable(f"AI request failed ({resp.status_code}): {detail[:200]}")
    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError) as exc:
        raise AIUnavailable("The AI returned no answer") from exc
    if not content.strip():
        raise AIUnavailable("The AI returned an empty answer")
    return content


async def complete_json(messages: list[dict[str, str]], *, max_tokens: int = 700) -> dict[str, Any]:
    raw = await complete(messages, json_mode=True, max_tokens=max_tokens)
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        # Some models wrap JSON in prose or a code fence; take the outermost object.
        start, end = raw.find("{"), raw.rfind("}")
        if start < 0 or end <= start:
            raise AIUnavailable("The AI answer wasn't valid JSON") from None
        try:
            result = json.loads(raw[start: end + 1])
        except json.JSONDecodeError as exc:
            raise AIUnavailable("The AI answer wasn't valid JSON") from exc
    if not isinstance(result, dict):
        raise AIUnavailable("The AI answer wasn't a JSON object")
    return result
