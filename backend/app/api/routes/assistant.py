"""AI assistant on the website: reply ideas, drafts, rules in plain English, questions; and sending email."""

import json
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter
from sse_starlette import EventSourceResponse

from app.ai import features as ai
from app.ai.client import AIUnavailable
from app.api.deps import DB, CurrentUser
from app.api.schemas import (
    AIStatus,
    AskOut,
    AskRef,
    AskRequest,
    DraftOut,
    DraftRequest,
    EmailAskOut,
    EmailAskRequest,
    OutboundCreate,
    OutboundEmailDetail,
    ReplyIdeaOut,
    ReplyIdeasRequest,
    ReviseRequest,
    RuleFromText,
    RuleIdeaOut,
)
from app.core.config import PLANS
from app.core.errors import AppError, NotFound, TooManyRequests, UpstreamError
from app.core.redis import Keys, get_redis
from app.core.runtime import ai_config
from app.models import Mailbox, Message, OutboundEmail, OutboundStatus, User, UserSettings
from app.notify.ratelimit import Bucket, RateLimiter
from app.services import assistant, compose, events

router = APIRouter(tags=["assistant"])


async def _require_ai(db: DB, user: User) -> None:
    if not await assistant.available(db, user):
        raise AppError("The AI assistant is turned off or not set up yet", code="ai_unavailable", status=503)


async def _message(db: DB, user: User, message_id: UUID) -> Message:
    message = await db.get(Message, message_id)
    if message is None or message.user_id != user.id:
        raise NotFound("Email not found")
    return message


def _draft_out(email: OutboundEmail) -> DraftOut:
    assert email.mailbox_id is not None  # drafts are always created with a sending mailbox
    return DraftOut(mailbox_id=email.mailbox_id, from_address=email.from_address, to=list(email.to_addresses),
                    cc=list(email.cc_addresses), subject=email.subject, body=email.body,
                    reply_to_message_id=email.reply_to_message_id)


def _assistant_error(exc: assistant.AssistantError) -> AppError:
    return AppError(str(exc), code="assistant_error", status=422)


@router.get("/ai/status", response_model=AIStatus)
async def status(user: CurrentUser, db: DB) -> AIStatus:
    configured = (await ai_config()).ready
    prefs = await db.get(UserSettings, user.id)
    mine = prefs.ai_enabled if prefs is not None else True
    return AIStatus(available=configured and mine, configured=configured, enabled_for_me=mine)


@router.post("/messages/{message_id}/ai/replies", response_model=list[ReplyIdeaOut])
async def reply_ideas(
    message_id: UUID, user: CurrentUser, db: DB, body: ReplyIdeasRequest | None = None,
) -> list[ReplyIdeaOut]:
    """Three reply ideas; pass `guidance` ("politely decline", "more formal") to steer them."""
    await _require_ai(db, user)
    message = await _message(db, user, message_id)
    try:
        result = await assistant.suggest(db, user, message, body.guidance if body else None)
    except assistant.AssistantError as exc:
        raise _assistant_error(exc) from exc
    return [ReplyIdeaOut(label=i.label, instruction=i.instruction) for i in result.ideas]


@router.post("/messages/{message_id}/ai/draft", response_model=DraftOut)
async def draft_reply(message_id: UUID, body: DraftRequest, user: CurrentUser, db: DB) -> DraftOut:
    """A reply written by the AI. Nothing is sent: the website shows it for editing first."""
    await _require_ai(db, user)
    message = await _message(db, user, message_id)
    try:
        email = await assistant.draft_reply_for(db, user, message, body.instructions, source="web")
    except assistant.AssistantError as exc:
        raise _assistant_error(exc) from exc
    out = _draft_out(email)
    await db.rollback()  # the website keeps the draft; no server-side draft row is needed
    return out


@router.post("/messages/{message_id}/ai/ask", response_model=EmailAskOut)
async def ask_about_email(message_id: UUID, body: EmailAskRequest, user: CurrentUser, db: DB) -> EmailAskOut:
    """Ask about one email ("what documents do I need?"); answered from its full text and earlier thread."""
    await _require_ai(db, user)
    message = await _message(db, user, message_id)
    try:
        answer = await assistant.ask_about(db, user, message, body.question,
                                           [(t.role, t.content) for t in body.history])
    except assistant.AssistantError as exc:
        raise _assistant_error(exc) from exc
    return EmailAskOut(answer=answer)


def _sse(pieces: AsyncIterator[str], done: Callable[[str], dict[str, Any]] | None = None) -> EventSourceResponse:
    """Stream an answer: `delta` events carry text as it's written, then `done` (or `error`)."""
    async def events() -> AsyncIterator[dict[str, str]]:
        text = ""
        try:
            async for piece in pieces:
                text += piece
                yield {"event": "delta", "data": json.dumps({"text": piece})}
        except AIUnavailable:
            yield {"event": "error", "data": json.dumps({"message": "The AI couldn't answer just now. Try again."})}
            return
        if not text.strip():
            yield {"event": "error", "data": json.dumps({"message": "The AI didn't answer. Try asking again."})}
            return
        yield {"event": "done", "data": json.dumps(done(text) if done else {})}

    return EventSourceResponse(events(), headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/messages/{message_id}/ai/ask/stream", response_class=EventSourceResponse,
             responses={200: {"content": {"text/event-stream": {}}}})
async def ask_about_email_stream(
    message_id: UUID, body: EmailAskRequest, user: CurrentUser, db: DB,
) -> EventSourceResponse:
    """Like /ai/ask, streamed as server-sent events: `delta` {text} …, then `done` {} or `error` {message}."""
    await _require_ai(db, user)
    message = await _message(db, user, message_id)
    try:
        pieces = await assistant.ask_about_stream(db, user, message, body.question,
                                                  [(t.role, t.content) for t in body.history])
    except assistant.AssistantError as exc:
        raise _assistant_error(exc) from exc
    return _sse(pieces)


@router.post("/ai/ask/stream", response_class=EventSourceResponse,
             responses={200: {"content": {"text/event-stream": {}}}})
async def ask_stream(body: AskRequest, user: CurrentUser, db: DB) -> EventSourceResponse:
    """/ai/ask, streamed: `delta` {text} …, then `done` {refs: [{message_id, ref, subject}]} or `error`."""
    await _require_ai(db, user)
    try:
        pieces, rows = await assistant.ask_stream(db, user, body.question)
    except assistant.AssistantError as exc:
        raise _assistant_error(exc) from exc
    cited = {m.ref: AskRef(message_id=m.id, ref=m.ref, subject=m.subject).model_dump(mode="json")
             for m in rows if m.ref}

    def done(text: str) -> dict[str, Any]:
        return {"refs": [cited[r] for r in ai.refs_in(text) if r in cited]}

    return _sse(pieces, done)


@router.post("/messages/{message_id}/reply-draft", response_model=DraftOut)
async def reply_draft(message_id: UUID, user: CurrentUser, db: DB) -> DraftOut:
    """An empty reply (sender, To and Subject filled in) to write yourself. Works without AI; nothing is sent."""
    message = await _message(db, user, message_id)
    try:
        mailbox, to, subject = await assistant.reply_defaults(db, user, message)
    except assistant.AssistantError as exc:
        raise _assistant_error(exc) from exc
    return DraftOut(mailbox_id=mailbox.id, from_address=mailbox.address, to=[to], cc=[], subject=subject, body="",
                    reply_to_message_id=message.id)


@router.post("/ai/compose", response_model=DraftOut)
async def compose_new(body: DraftRequest, user: CurrentUser, db: DB) -> DraftOut:
    await _require_ai(db, user)
    try:
        email = await assistant.draft_new(db, user, body.instructions, source="web")
    except assistant.AssistantError as exc:
        raise _assistant_error(exc) from exc
    out = _draft_out(email)
    await db.rollback()
    return out


@router.post("/ai/revise", response_model=DraftOut)
async def revise(body: ReviseRequest, user: CurrentUser, db: DB) -> DraftOut:
    await _require_ai(db, user)
    try:
        mailbox = await assistant.sending_mailbox(db, user.id, None)
    except assistant.AssistantError as exc:
        raise _assistant_error(exc) from exc
    previous = ai.Draft(body.subject, body.body, body.to, body.cc)
    try:
        if body.reply_to_message_id:
            message = await _message(db, user, body.reply_to_message_id)
            env = await assistant.fetch_email(db, message)
            draft = await ai.draft_reply(subject=env.subject, sender=f"{env.from_name} <{env.from_address}>",
                                         body=env.body_text or env.snippet, instructions=body.instructions,
                                         user_name=user.display_name, previous=previous)
            draft = ai.Draft(draft.subject, draft.body, body.to, body.cc)
        else:
            draft = await ai.draft_email(instructions=body.instructions, user_name=user.display_name,
                                         previous=previous)
            if not draft.to:
                draft = ai.Draft(draft.subject, draft.body, body.to, body.cc)
    except assistant.AssistantError as exc:
        raise _assistant_error(exc) from exc
    except AIUnavailable as exc:
        raise UpstreamError("The AI couldn't change the draft just now") from exc
    return DraftOut(mailbox_id=mailbox.id, from_address=mailbox.address, to=draft.to, cc=draft.cc,
                    subject=draft.subject, body=draft.body, reply_to_message_id=body.reply_to_message_id)


@router.post("/ai/rule", response_model=RuleIdeaOut)
async def rule_from_text(body: RuleFromText, user: CurrentUser, db: DB) -> RuleIdeaOut:
    """Turn 'anything from my college about exams' into a rule the user can review and save."""
    await _require_ai(db, user)
    try:
        idea = await ai.rule_from_text(body.description)
    except AIUnavailable as exc:
        raise AppError("The AI couldn't turn that into a rule. Try describing the sender or the words to look "
                       "for.", code="ai_rule_failed", status=422) from exc
    return RuleIdeaOut(name=idea.name, condition=idea.condition, explanation=idea.explanation)


@router.post("/ai/ask", response_model=AskOut)
async def ask(body: AskRequest, user: CurrentUser, db: DB) -> AskOut:
    await _require_ai(db, user)
    try:
        result = await assistant.ask(db, user, body.question)
    except assistant.AssistantError as exc:
        raise _assistant_error(exc) from exc
    return AskOut(answer=result.answer,
                  refs=[AskRef(message_id=m.id, ref=m.ref, subject=m.subject) for m in result.messages])


@router.post("/outbound-emails", response_model=OutboundEmailDetail, status_code=202)
async def send_from_web(body: OutboundCreate, user: CurrentUser, db: DB) -> OutboundEmailDetail:
    mailbox = await db.get(Mailbox, body.mailbox_id)
    if mailbox is None or mailbox.user_id != user.id:
        raise NotFound("Mailbox not found")
    if not mailbox.can_send:
        raise AppError(f"{mailbox.address} can't send email yet", code="mailbox_cannot_send", status=422)
    reply_to = await _message(db, user, body.reply_to_message_id) if body.reply_to_message_id else None
    plan = PLANS.get(user.plan, PLANS["free"])
    day = datetime.now(UTC).strftime("%Y%m%d")
    decision = await RateLimiter(get_redis()).acquire(
        Bucket.window(Keys.rate_email(user.id, day), plan.daily_emails, 26 * 3600))
    if not decision.allowed:
        raise TooManyRequests(f"You've reached today's limit of {plan.daily_emails} emails",
                              retry_after=int(decision.retry_after_s) or 3600)
    email = await assistant.create_draft(db, user, mailbox=mailbox, to=body.to, cc=body.cc, bcc=body.bcc,
                                         subject=body.subject, body=body.body, reply_to=reply_to, source="web",
                                         replace_pending=False)
    email.status = OutboundStatus.queued
    email.confirm_expires_at = None
    await db.commit()
    await events.publish(user.id, "email.updated", {"id": str(email.id), "status": "queued"})
    if compose.kick_send is not None:
        await compose.kick_send(str(email.id))
    await db.refresh(email)
    return OutboundEmailDetail.model_validate(email)
