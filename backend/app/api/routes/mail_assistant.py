"""The mail assistant on the website: a conversation that finds, explains and replies to any email.

POST /assistant/chat streams server-sent events while the assistant works:
  conversation {conversation_id} → status {text}… → results {items} (the matches found, numbered) →
  delta {text}… (the answer) → done {conversation_id, opened, draft}  — or error {message}.
"""

import asyncio
import json
import re
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Path
from sse_starlette import EventSourceResponse

from app.ai.client import AIUnavailable
from app.api.deps import DB, CurrentUser
from app.api.schemas import AssistantChatRequest, AssistantOpened
from app.core.db import session_factory
from app.core.errors import AppError, NotFound
from app.core.logging import log
from app.models import User
from app.services import assistant, mail_agent, mail_search

router = APIRouter(tags=["assistant"])
ConversationId = Path(pattern=r"^[a-f0-9]{32}$")


def _channel(conversation_id: str) -> str:
    return f"web:{conversation_id}"


def _event(name: str, data: dict[str, Any]) -> dict[str, str]:
    return {"event": name, "data": json.dumps(data, default=str)}


@router.post("/assistant/chat", response_class=EventSourceResponse,
             responses={200: {"content": {"text/event-stream": {}}}})
async def chat(body: AssistantChatRequest, user: CurrentUser, db: DB) -> EventSourceResponse:
    """One message to the mail assistant, answered as a stream of events (see the module docstring)."""
    if not await assistant.available(db, user):
        raise AppError("The AI assistant is turned off or not set up yet", code="ai_unavailable", status=503)
    conversation = body.conversation_id or uuid4().hex
    user_id, message = user.id, body.message

    async def events() -> AsyncIterator[dict[str, str]]:
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()

        async def emit(event: str, data: dict[str, Any]) -> None:
            await queue.put((event, data))

        async def work() -> None:
            # Its own database session: the request's session is closed once streaming starts.
            async with session_factory()() as session:
                me = await session.get(User, user_id)
                try:
                    assert me is not None
                    result = await mail_agent.turn(session, me, _channel(conversation), message, emit=emit)
                    await session.commit()
                    await queue.put(("_result", result))
                except mail_agent.AssistantBusy as exc:
                    await queue.put(("error", {"message": str(exc)}))
                except AIUnavailable:
                    await queue.put(("error", {"message": "The assistant couldn't answer just now. Try again."}))
                except Exception:
                    log.exception("mail_assistant_failed")
                    await queue.put(("error", {"message": "Something went wrong. Try again."}))

        task = asyncio.create_task(work())
        try:
            yield _event("conversation", {"conversation_id": conversation})
            while True:
                event, data = await queue.get()
                if event == "error":
                    yield _event("error", data)
                    return
                if event != "_result":
                    yield _event(event, data)
                    continue
                result: mail_agent.TurnResult = data
                if result.listed:
                    yield _event("results", {"items": result.listed, "final": True})
                for piece in re.findall(r"\S+\s*", result.text):
                    yield _event("delta", {"text": piece})
                yield _event("done", {
                    "conversation_id": conversation, "draft": result.draft,
                    "opened": [{"message_id": str(m.id), "code": m.ref} for m in result.opened]})
                return
        finally:
            if not task.done():
                task.cancel()

    return EventSourceResponse(events(), headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/assistant/conversations/{conversation_id}/results/{n}/open", response_model=AssistantOpened)
async def open_result(user: CurrentUser, db: DB, n: int, conversation_id: str = ConversationId) -> AssistantOpened:
    """Open a result card: the email is kept (gets a #code) and can be viewed at /messages/{message_id}."""
    try:
        message = await mail_agent.open_number(db, user, _channel(conversation_id), n)
    except mail_search.SearchError as exc:
        raise AppError(str(exc), code="open_failed", status=422) from exc
    if message is None:
        raise NotFound("That result is no longer available. Search again.")
    await db.commit()
    return AssistantOpened(message_id=message.id, code=message.ref)


@router.delete("/assistant/conversations/{conversation_id}", status_code=204)
async def forget(user: CurrentUser, conversation_id: str = ConversationId) -> None:
    await mail_agent.end(user.id, _channel(conversation_id))
