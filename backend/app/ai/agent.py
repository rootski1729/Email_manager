"""A small, strict tool-using loop on top of the chat completions API.

The model may call the tools it's given, a few at a time, for a limited number of steps; every tool result goes
back to it as data. The loop never lets the model act outside those tools, and it always ends with plain text.
"""

import json
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from app.ai.client import AIUnavailable, complete_tools
from app.core.logging import log

ToolHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]
MAX_TOOL_RESULT_CHARS = 12_000


@dataclass(frozen=True, slots=True)
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema
    handler: ToolHandler

    def spec(self) -> dict[str, Any]:
        return {"type": "function",
                "function": {"name": self.name, "description": self.description, "parameters": self.parameters}}


@dataclass
class AgentRun:
    text: str
    steps: int
    tool_calls: list[str]


async def run_agent(
    messages: list[dict[str, Any]], tools: list[Tool], *, max_steps: int = 6, deadline_s: float = 60.0,
    max_tokens: int = 600,
) -> AgentRun:
    """Run until the model answers in text. Tool errors are returned to the model as data, not raised."""
    by_name = {t.name: t for t in tools}
    specs = [t.spec() for t in tools]
    started = time.monotonic()
    called: list[str] = []
    for step in range(1, max_steps + 1):
        if step == max_steps or time.monotonic() - started > deadline_s:
            reply = await _final(messages, max_tokens)  # out of steps or time: answer with what's known
        else:
            reply = await complete_tools(messages, specs, max_tokens=max_tokens)
        calls = reply.get("tool_calls") or []
        if not calls:
            text = (reply.get("content") or "").strip()
            if not text:
                raise AIUnavailable("The AI didn't answer")
            log.info("agent_done", steps=step, tools=called, seconds=round(time.monotonic() - started, 1))
            return AgentRun(text, step, called)
        messages.append({"role": "assistant", "content": reply.get("content") or "", "tool_calls": calls})
        for call in calls:
            name = (call.get("function") or {}).get("name", "")
            called.append(name)
            try:
                args = json.loads((call.get("function") or {}).get("arguments") or "{}")
                if not isinstance(args, dict):
                    raise ValueError("arguments must be an object")
                tool = by_name.get(name)
                result = await tool.handler(args) if tool else {"error": f"unknown tool {name}"}
            except (ValueError, TypeError) as exc:
                result = {"error": f"bad arguments: {exc}"}
            content = json.dumps(result, ensure_ascii=False, default=str)[:MAX_TOOL_RESULT_CHARS]
            messages.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": content})
    raise AIUnavailable("The assistant ran out of steps")


async def _final(messages: list[dict[str, Any]], max_tokens: int) -> dict[str, Any]:
    """Last step: no more tools, answer with what's known."""
    nudge = {"role": "system", "content": "Stop using tools now and answer the user with what you have."}
    return await complete_tools([*messages, nudge], [], max_tokens=max_tokens)
