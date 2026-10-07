"""AI assistant on the website: reply ideas, drafts, rules in plain English, questions; and sending email."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter

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
    OutboundCreate,
    OutboundEmailDetail,
    ReplyIdeaOut,
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
async def reply_ideas(message_id: UUID, user: CurrentUser, db: DB) -> list[ReplyIdeaOut]:
    await _require_ai(db, user)
    message = await _message(db, user, message_id)
    try:
        result = await assistant.suggest(db, user, message)
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
