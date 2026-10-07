"""AI assistant (Azure AI Foundry): reply suggestions, drafting, edits and questions, shared by WhatsApp and web.

Drafts become ordinary OutboundEmail rows in `awaiting_confirmation`: nothing is sent until the user says YES on
WhatsApp or presses Send on the web, through exactly the same send path as hand-written emails.
"""

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import getaddresses
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import features as ai
from app.ai.client import AIUnavailable
from app.core.config import get_settings
from app.core.db import uuid7
from app.core.redis import get_redis
from app.core.runtime import ai_config
from app.core.security import phone_to_chat_id
from app.models import (
    Event,
    EventStatus,
    Mailbox,
    MailboxStatus,
    Message,
    OutboundEmail,
    OutboundStatus,
    User,
    UserSettings,
)
from app.notify import wa
from app.rules.envelope import Envelope
from app.services import mail_content
from app.services.schedule import tz

SUGGESTIONS_TTL_S = 30 * 60
ASK_CONTEXT_MESSAGES = 40


class AssistantError(Exception):
    """A user-facing reason the assistant can't help right now."""


def _suggestions_key(user_id: Any) -> str:
    return f"ai:replies:{user_id}"


async def available(db: AsyncSession, user: User) -> bool:
    if not (await ai_config()).ready:
        return False
    prefs = await db.get(UserSettings, user.id)
    return prefs.ai_enabled if prefs is not None else True


async def fetch_email(db: AsyncSession, message: Message) -> Envelope:
    """The full email, read live from the mailbox (bodies are never stored)."""
    try:
        return (await mail_content.fetch_full(db, message)).env
    except mail_content.ContentError as exc:
        raise AssistantError(str(exc)) from exc


def _sender(env: Envelope) -> str:
    return f"{env.from_name} <{env.from_address}>".strip()


def reply_address(message: Message, env: Envelope | None) -> str:
    reply_to = ((message.headers or {}).get("reply-to") or [None])[0]
    if reply_to:
        parsed = [a for _, a in getaddresses([reply_to]) if a]
        if parsed:
            return parsed[0]
    return message.from_address


async def sending_mailbox(db: AsyncSession, user_id: UUID, preferred: UUID | None) -> Mailbox:
    rows = list((await db.scalars(select(Mailbox).where(
        Mailbox.user_id == user_id, Mailbox.can_send.is_(True),
        Mailbox.status.in_([MailboxStatus.active, MailboxStatus.paused, MailboxStatus.error]),
    ).order_by(Mailbox.created_at))).all())
    if not rows:
        raise AssistantError("To send email, connect a mailbox that can send: reconnect Gmail with sending allowed, "
                             f"or add SMTP settings in {get_settings().public_web_url.rstrip('/')}/mailboxes")
    return next((m for m in rows if m.id == preferred), rows[0])


# ---------------------------------------------------------------- drafts


async def create_draft(
    db: AsyncSession, user: User, *, mailbox: Mailbox, to: list[str], cc: list[str], subject: str, body: str,
    reply_to: Message | None = None, source: str = "whatsapp", bcc: list[str] | None = None,
    replace_pending: bool = True,
) -> OutboundEmail:
    """A draft waiting for confirmation. A newer draft replaces any older unconfirmed one."""
    if replace_pending:
        await db.execute(update(OutboundEmail).where(
            OutboundEmail.user_id == user.id, OutboundEmail.status == OutboundStatus.awaiting_confirmation,
        ).values(status=OutboundStatus.expired))
    email = OutboundEmail(
        id=uuid7(), user_id=user.id, mailbox_id=mailbox.id, from_address=mailbox.address, to_addresses=to,
        cc_addresses=cc, bcc_addresses=bcc or [], subject=subject, body=body,
        status=OutboundStatus.awaiting_confirmation, source=source, chat_id=phone_to_chat_id(user.phone_e164),
        template_name="ai" if source != "web" else None,
        confirm_expires_at=datetime.now(UTC) + timedelta(seconds=get_settings().compose_confirm_ttl_s),
    )
    if reply_to is not None:
        email.reply_to_message_id = reply_to.id
        original_id = ((reply_to.headers or {}).get("message-id") or [None])[0]
        if original_id:
            email.in_reply_to = original_id[:998]
            email.references = original_id
        if reply_to.mailbox_id == mailbox.id and reply_to.thread_id:
            email.provider_thread_id = reply_to.thread_id
    db.add(email)
    await db.flush()
    return email


async def latest_draft(db: AsyncSession, user_id: UUID) -> OutboundEmail | None:
    return await db.scalar(select(OutboundEmail).where(
        OutboundEmail.user_id == user_id, OutboundEmail.status == OutboundStatus.awaiting_confirmation,
    ).order_by(OutboundEmail.created_at.desc()).limit(1))


def draft_preview(email: OutboundEmail) -> str:
    """The draft as it will be sent, set apart from the instructions so it's easy to read and check."""
    kind = "reply" if email.reply_to_message_id else "email"
    lines = [f"✍️ *Your {kind} is ready* · _not sent yet_", "",
             f"*From:* {email.from_address}", f"*To:* {', '.join(email.to_addresses)}"]
    if email.cc_addresses:
        lines.append(f"*Cc:* {', '.join(email.cc_addresses)}")
    lines += [f"*Subject:* {wa.plain(email.subject) or '(no subject)'}", wa.RULE, ""]
    body = re.sub(r"\n\s*\n\s*\n+", "\n\n", email.body.strip())
    if len(body) > 2500:
        body = body[:2500].rstrip() + "…"
    lines += [wa.plain(body), "", wa.RULE]
    minutes = get_settings().compose_confirm_ttl_s // 60
    lines += ["✅ *YES* · send it", "❌ *NO* · cancel",
              "✏️ */edit …* · change it, e.g. */edit shorter and more formal*",
              f"_The draft waits {minutes} minutes._"]
    return "\n".join(lines)


# ---------------------------------------------------------------- replying to an alerted email


@dataclass
class Suggestions:
    message: Message
    ideas: list[ai.ReplyIdea]


async def suggest(db: AsyncSession, user: User, message: Message, guidance: str | None = None) -> Suggestions:
    env = await fetch_email(db, message)
    try:
        ideas = await ai.suggest_replies(subject=env.subject, sender=_sender(env), body=env.body_text or env.snippet,
                                         user_name=user.display_name, guidance=guidance)
    except AIUnavailable as exc:
        raise AssistantError("The AI couldn't suggest replies just now.") from exc
    await get_redis().set(_suggestions_key(user.id), json.dumps(
        {"message_id": str(message.id), "ideas": [{"label": i.label, "instruction": i.instruction} for i in ideas]}),
        ex=SUGGESTIONS_TTL_S)
    return Suggestions(message, ideas)


async def draft_reply_for(
    db: AsyncSession, user: User, message: Message, instructions: str, *, source: str = "whatsapp",
) -> OutboundEmail:
    env = await fetch_email(db, message)
    mailbox = await sending_mailbox(db, user.id, message.mailbox_id)
    try:
        draft = await ai.draft_reply(subject=env.subject, sender=_sender(env), body=env.body_text or env.snippet,
                                     instructions=instructions, user_name=user.display_name)
    except AIUnavailable as exc:
        hint = f" Or write it yourself: /reply {message.ref} manual" if source == "whatsapp" else ""
        raise AssistantError(f"The AI couldn't write the reply just now. Try again in a minute.{hint}") from exc
    return await create_draft(db, user, mailbox=mailbox, to=[reply_address(message, env)], cc=[],
                              subject=draft.subject, body=draft.body, reply_to=message, source=source)


async def picked(db: AsyncSession, user: User, number: int, extra: str = "") -> tuple[Message, str] | None:
    """The suggestion the user picked with '1', '2' or '3' (plus any words they added), if a list is open."""
    raw = await get_redis().get(_suggestions_key(user.id))
    if not raw:
        return None
    data = json.loads(raw)
    ideas = data.get("ideas", [])
    if not 1 <= number <= len(ideas):
        return None
    message = await db.get(Message, UUID(data["message_id"]))
    if message is None or message.user_id != user.id:
        return None
    instruction = ideas[number - 1]["instruction"]
    return message, f"{instruction}. Also: {extra.strip()}" if extra.strip() else instruction


async def clear_suggestions(user_id: Any) -> None:
    await get_redis().delete(_suggestions_key(user_id))


# ---------------------------------------------------------------- new emails and edits


async def draft_new(db: AsyncSession, user: User, instructions: str, *, source: str = "whatsapp") -> OutboundEmail:
    mailbox = await sending_mailbox(db, user.id, None)
    try:
        draft = await ai.draft_email(instructions=instructions, user_name=user.display_name)
    except AIUnavailable as exc:
        raise AssistantError("The AI couldn't write that email just now. Try again in a minute.") from exc
    if not draft.to:
        raise AssistantError("Who should I send it to? Include an email address, e.g. "
                             "*/write email prof@college.edu asking for leave tomorrow*")
    return await create_draft(db, user, mailbox=mailbox, to=draft.to, cc=draft.cc, subject=draft.subject,
                              body=draft.body, source=source)


async def revise(db: AsyncSession, user: User, email: OutboundEmail, instructions: str) -> OutboundEmail:
    previous = ai.Draft(email.subject, email.body, list(email.to_addresses), list(email.cc_addresses))
    try:
        if email.reply_to_message_id:
            original = await db.get(Message, email.reply_to_message_id)
            env = await fetch_email(db, original) if original else None
            draft = await ai.draft_reply(
                subject=env.subject if env else email.subject, sender=_sender(env) if env else "",
                body=(env.body_text or env.snippet) if env else "", instructions=instructions,
                user_name=user.display_name, previous=previous)
            draft = ai.Draft(draft.subject, draft.body, list(email.to_addresses), list(email.cc_addresses))
        else:
            draft = await ai.draft_email(instructions=instructions, user_name=user.display_name, previous=previous)
            if not draft.to:
                draft = ai.Draft(draft.subject, draft.body, list(email.to_addresses), list(email.cc_addresses))
    except AIUnavailable as exc:
        raise AssistantError("The AI couldn't change the draft just now. Try again in a minute.") from exc
    email.subject, email.body = draft.subject or email.subject, draft.body
    email.to_addresses, email.cc_addresses = draft.to, draft.cc
    email.confirm_expires_at = datetime.now(UTC) + timedelta(seconds=get_settings().compose_confirm_ttl_s)
    await db.flush()
    return email


# ---------------------------------------------------------------- questions


@dataclass
class AskResult:
    answer: str
    messages: list[Message]


async def ask(db: AsyncSession, user: User, question: str) -> AskResult:
    rows = list((await db.scalars(select(Message).where(Message.user_id == user.id)
                                  .order_by(Message.received_at.desc()).limit(ASK_CONTEXT_MESSAGES))).all())
    zone = tz(user.timezone)
    events = (await db.scalars(select(Event).where(
        Event.user_id == user.id, Event.status.in_([EventStatus.upcoming, EventStatus.suggested]),
        Event.starts_at >= datetime.now(UTC) - timedelta(days=1)).order_by(Event.starts_at).limit(20))).all()
    lines = []
    for m in rows:
        about = m.ai_summary or (m.snippet or "")[:300]
        lines.append(f"#{m.ref} | {m.received_at.astimezone(zone):%d %b %Y %H:%M} | from {m.from_name or ''} "
                     f"<{m.from_address}> | {m.subject} | {' '.join(about.split())}")
    for e in events:
        when = e.starts_at.astimezone(zone).strftime("%d %b %Y" if e.all_day else "%d %b %Y %H:%M")
        lines.append(f"[date] {when} | {e.kind.value} | {e.title}")
    if not lines:
        raise AssistantError("You have no important emails yet, so there's nothing to search.")
    try:
        result = await ai.ask(question=question, context="\n".join(lines),
                              today=datetime.now(zone).strftime("%A %d %B %Y"))
    except AIUnavailable as exc:
        raise AssistantError("The AI couldn't answer just now. Try again in a minute.") from exc
    by_ref = {m.ref: m for m in rows if m.ref}
    return AskResult(result.answer, [by_ref[r] for r in result.refs if r in by_ref])
