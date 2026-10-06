"""WhatsApp → email: `/email` sends a form, `/send` builds a preview, `YES` sends it from the user's mailbox.

Security model:
- Only the account owner's own WhatsApp number (users.phone_e164) can compose. Alert destinations such as a
  family member's number or a group can never send email.
- Every email needs an explicit YES within a short window. Sends are limited per day by plan.
- The bot never reacts to its own messages (needed when WAHA is paired with the user's own phone and the user
  talks to the bot in "Message yourself").
"""

import json
import mimetypes
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import stamina
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.compose import commands as cmd
from app.compose.mailer import OutgoingFile, SendError, build_message, send_gmail, send_smtp
from app.core.config import PLANS, get_settings
from app.core.db import session_factory, uuid7
from app.core.logging import log
from app.core.redis import Keys, get_redis
from app.core.security import normalize_phone, phone_to_chat_id, vault
from app.models import (
    Destination,
    DestinationKind,
    EmailTemplate,
    Mailbox,
    MailboxStatus,
    Message,
    NotificationKind,
    OutboundAttachment,
    OutboundEmail,
    OutboundStatus,
    Provider,
    User,
    UserSettings,
)
from app.notify import guard
from app.notify.ratelimit import Bucket, RateLimiter
from app.notify.waha import WahaClient, WahaError
from app.providers.base import ProviderError, ReauthRequired
from app.providers.gmail import GmailSession
from app.services import alert_actions as actions
from app.services import events, outbox
from app.services.schedule import tz

INBOUND_DEDUPE_S = 24 * 3600
LID_CACHE_S = 24 * 3600

# Set by the worker module so that services don't import task definitions.
kick_send: Any = None


# ---------------------------------------------------------------- identity & loop guards


def chat_to_phone(chat_id: str | None) -> str | None:
    if not chat_id or "@" not in chat_id:
        return None
    user, _, server = chat_id.partition("@")
    if server not in ("c.us", "s.whatsapp.net"):
        return None
    return normalize_phone("+" + user.split(":")[0])


async def resolve_phone(chat_id: str | None, waha: WahaClient) -> str | None:
    if chat_id and chat_id.endswith("@lid"):
        redis = get_redis()
        cached = await redis.get(Keys.lid(chat_id))
        if cached is None:
            try:
                cached = await waha.phone_for_lid(chat_id) or ""
            except WahaError:
                return None
            await redis.set(Keys.lid(chat_id), cached, ex=LID_CACHE_S)
        chat_id = str(cached) or None
    return chat_to_phone(chat_id)


async def own_phone(waha: WahaClient) -> str | None:
    raw = await get_redis().get(Keys.WAHA_HEALTH)
    me = json.loads(raw).get("me") if raw else None
    if not me:
        try:
            me = (await waha.session_info()).get("me", {}).get("id")
        except WahaError:
            return None
    return chat_to_phone(me)


@dataclass
class Inbound:
    id: str
    text: str
    sender_phone: str
    has_media: bool
    media: dict[str, Any] | None
    quoted: str | None = None  # text of the message being replied to (WhatsApp "reply" / swipe)


async def identify(payload: dict[str, Any], waha: WahaClient) -> Inbound | None:
    """Return who sent this message, or None if the bot should ignore it."""
    message_id = str(payload.get("id") or "")
    chat = str(payload.get("from") or "")
    if not message_id or chat.endswith("@g.us") or chat.endswith("@newsletter") or chat == "status@broadcast":
        return None
    text = str(payload.get("body") or "")
    if payload.get("fromMe"):
        # Only the "Message yourself" chat counts, and never our own replies.
        if await guard.is_own_id(message_id):
            return None
        target = str(payload.get("to") or "")
        if await guard.is_own_text(target, text):
            return None
        me = await own_phone(waha)
        if not me or await resolve_phone(target, waha) != me:
            return None
        sender = me
        if await guard.is_own_text(phone_to_chat_id(me), text):
            return None
    else:
        sender = await resolve_phone(chat, waha)
        if not sender:
            return None
    media = payload.get("media") if isinstance(payload.get("media"), dict) else None
    reply_to = payload.get("replyTo") if isinstance(payload.get("replyTo"), dict) else None
    quoted = str(reply_to.get("body") or "") if reply_to else None
    return Inbound(message_id, text, sender, bool(payload.get("hasMedia")), media, quoted or None)


# ---------------------------------------------------------------- replies


async def _self_destination(db: AsyncSession, user: User) -> Destination:
    dest = await db.scalar(select(Destination).where(
        Destination.user_id == user.id, Destination.kind == DestinationKind.whatsapp_self))
    if dest is None:  # recreate if it was somehow removed
        dest = Destination(id=uuid7(), user_id=user.id, kind=DestinationKind.whatsapp_self,
                           chat_id=phone_to_chat_id(user.phone_e164), label="My WhatsApp",
                           verified_at=datetime.now(UTC))
        db.add(dest)
        await db.flush()
    return dest


async def reply(db: AsyncSession, user: User, *texts: str) -> None:
    dest = await _self_destination(db, user)
    for text in texts:
        await outbox.enqueue(db, user_id=user.id, destination=dest, kind=NotificationKind.reply,
                             payload={"text": text}, dedupe=f"reply:{uuid7()}")


# ---------------------------------------------------------------- mailboxes & templates


async def sending_mailboxes(db: AsyncSession, user_id: UUID) -> list[Mailbox]:
    return list((await db.scalars(select(Mailbox).where(
        Mailbox.user_id == user_id, Mailbox.can_send.is_(True),
        Mailbox.status.in_([MailboxStatus.active, MailboxStatus.paused, MailboxStatus.error]),
    ).order_by(Mailbox.created_at))).all())


async def find_template(db: AsyncSession, user_id: UUID, name: str) -> EmailTemplate | None:
    if name:
        return await db.scalar(select(EmailTemplate).where(
            EmailTemplate.user_id == user_id, EmailTemplate.name == name.lower()))
    return await db.scalar(select(EmailTemplate).where(
        EmailTemplate.user_id == user_id, EmailTemplate.is_default.is_(True)))


def template_values(template: EmailTemplate | None, mailbox: Mailbox | None, user: User) -> cmd.TemplateValues:
    now = datetime.now(UTC).astimezone(tz(user.timezone))

    def fill(text: str) -> str:
        return cmd.fill_placeholders(text, now=now, name=user.display_name)

    return cmd.TemplateValues(
        from_address=mailbox.address if mailbox else "",
        to=list(template.to_addresses) if template else [],
        cc=list(template.cc_addresses) if template else [],
        bcc=list(template.bcc_addresses) if template else [],
        subject=fill(template.subject) if template else "",
        body=fill(template.body) if template else "",
    )


def pick_mailbox(mailboxes: list[Mailbox], preferred: UUID | None) -> Mailbox | None:
    for m in mailboxes:
        if m.id == preferred:
            return m
    return mailboxes[0] if mailboxes else None


# ---------------------------------------------------------------- command handlers


async def _on_email(db: AsyncSession, user: User, name: str) -> None:
    template = await find_template(db, user.id, name)
    if name and template is None:
        names = (await db.scalars(select(EmailTemplate.name).where(EmailTemplate.user_id == user.id)
                                  .order_by(EmailTemplate.name))).all()
        hint = f"Your templates: {', '.join(names)}" if names else "You have no templates yet; create one in the app."
        await reply(db, user, f"I couldn't find a template called *{name}*.\n{hint}")
        return
    mailboxes = await sending_mailboxes(db, user.id)
    if not mailboxes:
        await reply(db, user, "To send email, connect a mailbox that can send: reconnect Gmail with *sending "
                              f"allowed*, or add SMTP settings to an IMAP mailbox in "
                              f"{get_settings().public_web_url.rstrip('/')}/mailboxes")
        return
    mailbox = pick_mailbox(mailboxes, template.mailbox_id if template else None)
    await get_redis().set(Keys.compose_session(user.id),
                          json.dumps({"started_at": datetime.now(UTC).isoformat(), "template": name or None}),
                          ex=get_settings().compose_session_ttl_s)
    if template:
        template.use_count += 1
    intro = cmd.INSTRUCTIONS
    if template:
        intro = f"📄 Template *{template.name}*" + (f" – {template.description}" if template.description else "") \
            + "\n\n" + intro
    await reply(db, user, intro, cmd.render_form(template_values(template, mailbox, user)))


async def _on_reply(db: AsyncSession, user: User, arg: str) -> None:
    texts, context = await actions.on_reply(db, user, arg)
    if context is None:
        await reply(db, user, *texts)
        return
    mailboxes = await sending_mailboxes(db, user.id)
    if not mailboxes:
        link = f"{get_settings().public_web_url.rstrip('/')}/mailboxes"
        await reply(db, user, "To reply by email, connect a mailbox that can send: reconnect Gmail with *sending "
                              f"allowed*, or add SMTP settings in {link}")
        return
    mailbox = pick_mailbox(mailboxes, UUID(context["mailbox_id"]))
    await actions.open_session(user.id, context)
    values = cmd.TemplateValues(from_address=mailbox.address if mailbox else "", to=[context["to"]], cc=[], bcc=[],
                                subject=context["subject"], body="")
    await reply(db, user, "↩️ *Reply by email* – copy the next message, write your answer after *Body:* and send it "
                          "back. I'll show a preview before anything is sent.", cmd.render_form(values))


async def _on_templates(db: AsyncSession, user: User) -> None:
    rows = (await db.scalars(select(EmailTemplate).where(EmailTemplate.user_id == user.id)
                             .order_by(EmailTemplate.is_default.desc(), EmailTemplate.name))).all()
    if not rows:
        await reply(db, user, "You have no email templates yet. Create them in the app under *Email templates*, "
                              "or send */email* for a blank form.")
        return
    lines = ["📄 *Your email templates*", ""]
    for t in rows:
        star = " ⭐" if t.is_default else ""
        lines.append(f"• /email {t.name}{star}" + (f" – {t.description}" if t.description else ""))
    await reply(db, user, "\n".join(lines))


async def _staged(db: AsyncSession, user_id: UUID) -> list[OutboundAttachment]:
    return list((await db.scalars(select(OutboundAttachment).where(
        OutboundAttachment.user_id == user_id, OutboundAttachment.email_id.is_(None))
        .order_by(OutboundAttachment.created_at))).all())


def _preview(email: OutboundEmail, files: list[OutboundAttachment], expires_min: int) -> str:
    lines = ["📧 *Ready to send*", "", f"*From:* {email.from_address}", f"*To:* {', '.join(email.to_addresses)}"]
    if email.cc_addresses:
        lines.append(f"*Cc:* {', '.join(email.cc_addresses)}")
    if email.bcc_addresses:
        lines.append(f"*Bcc:* {', '.join(email.bcc_addresses)}")
    lines.append(f"*Subject:* {email.subject or '(no subject)'}")
    if files:
        lines.append(f"*Attachments:* {len(files)}")
        lines += [f"   📎 {f.filename} ({cmd.human_size(f.size)})" for f in files]
    body = email.body.strip()
    if body:
        preview = body if len(body) <= 600 else body[:600].rstrip() + "…"
        lines += ["", *[f"> {line}" if line.strip() else ">" for line in preview.splitlines()[:15]]]
    lines += ["", f"Reply *YES* to send or *NO* to cancel (expires in {expires_min} min)."]
    return "\n".join(lines)


async def _on_send(db: AsyncSession, user: User, text: str) -> None:
    settings = get_settings()
    draft = cmd.parse_draft(text, max_recipients=settings.compose_max_recipients)
    mailboxes = await sending_mailboxes(db, user.id)
    mailbox: Mailbox | None = None
    if draft.from_address:
        mailbox = next((m for m in mailboxes if m.address.lower() == draft.from_address.lower()), None)
        if mailbox is None:
            options = ", ".join(m.address for m in mailboxes) or "none yet"
            draft.errors.append(f"From: {draft.from_address} isn't one of your mailboxes that can send "
                                f"(available: {options})")
    elif len(mailboxes) == 1:
        mailbox = mailboxes[0]
    else:
        draft.errors.append("Add 'From:' with the mailbox to send from" if mailboxes
                            else "Connect a mailbox that can send first")
    files = await _staged(db, user.id)
    if len(files) > settings.compose_max_attachments:
        draft.errors.append(f"At most {settings.compose_max_attachments} attachments")
    if sum(f.size for f in files) > settings.compose_max_total_bytes:
        draft.errors.append(f"Attachments are larger than {cmd.human_size(settings.compose_max_total_bytes)} "
                            "in total")
    if not draft.body.strip() and not files:
        draft.errors.append("Write something after 'Body:' or attach a file")
    if draft.errors or mailbox is None:
        problems = "\n".join(f"• {e}" for e in dict.fromkeys(draft.errors))
        await reply(db, user, f"⚠️ I couldn't prepare that email:\n{problems}\n\nFix the form and send it again, "
                              "or send */email* for a fresh one.")
        return

    # A newer draft replaces any older one still waiting for YES.
    await db.execute(update(OutboundEmail).where(
        OutboundEmail.user_id == user.id, OutboundEmail.status == OutboundStatus.awaiting_confirmation,
    ).values(status=OutboundStatus.expired))
    session_raw = await get_redis().get(Keys.compose_session(user.id))
    session = json.loads(session_raw) if session_raw else {}
    email = OutboundEmail(
        id=uuid7(), user_id=user.id, mailbox_id=mailbox.id, from_address=mailbox.address,
        to_addresses=draft.to, cc_addresses=draft.cc, bcc_addresses=draft.bcc, subject=draft.subject,
        body=draft.body, status=OutboundStatus.awaiting_confirmation, source="whatsapp",
        chat_id=phone_to_chat_id(user.phone_e164), template_name=session.get("template"),
        confirm_expires_at=datetime.now(UTC) + timedelta(seconds=settings.compose_confirm_ttl_s),
    )
    if session.get("reply_to"):
        await _thread_reply(db, email, UUID(session["reply_to"]))
    db.add(email)
    await db.flush()
    if files:
        await db.execute(update(OutboundAttachment).where(OutboundAttachment.id.in_([f.id for f in files]))
                         .values(email_id=email.id))
    await reply(db, user, _preview(email, files, settings.compose_confirm_ttl_s // 60))


async def _thread_reply(db: AsyncSession, email: OutboundEmail, message_id: UUID) -> None:
    """Make the email a proper reply: In-Reply-To/References, and the Gmail thread when sent from that mailbox."""
    original = await db.get(Message, message_id)
    if original is None or original.user_id != email.user_id:
        return
    email.reply_to_message_id = original.id
    original_id = ((original.headers or {}).get("message-id") or [None])[0]
    if original_id:
        email.in_reply_to = original_id[:998]
        email.references = original_id
    if original.mailbox_id == email.mailbox_id and original.thread_id:
        email.provider_thread_id = original.thread_id


async def _on_confirm(db: AsyncSession, user: User) -> UUID | None:
    """Queue the waiting draft; returns its id so the caller can start sending after commit."""
    email = await db.scalar(select(OutboundEmail).where(
        OutboundEmail.user_id == user.id, OutboundEmail.status == OutboundStatus.awaiting_confirmation,
    ).order_by(OutboundEmail.created_at.desc()).limit(1).with_for_update())
    if email is None or (email.confirm_expires_at and email.confirm_expires_at < datetime.now(UTC)):
        if email is not None:
            email.status = OutboundStatus.expired
        await reply(db, user, "There's no email waiting for confirmation. Send */email* to start one.")
        return None
    plan = PLANS.get(user.plan, PLANS["free"])
    day = datetime.now(UTC).strftime("%Y%m%d")
    decision = await RateLimiter(get_redis()).acquire(
        Bucket.window(Keys.rate_email(user.id, day), plan.daily_emails, 26 * 3600))
    if not decision.allowed:
        await reply(db, user, f"⛔ You've reached today's limit of {plan.daily_emails} emails. "
                              "The draft is kept; reply YES again tomorrow.")
        return None
    email.status = OutboundStatus.queued
    email.confirm_expires_at = None
    await get_redis().delete(Keys.compose_session(user.id))
    await reply(db, user, "⏳ Sending…")
    await db.flush()
    return email.id


async def _on_cancel(db: AsyncSession, user: User) -> None:
    result = await db.execute(update(OutboundEmail).where(
        OutboundEmail.user_id == user.id, OutboundEmail.status == OutboundStatus.awaiting_confirmation,
    ).values(status=OutboundStatus.cancelled))
    removed = await db.execute(delete(OutboundAttachment).where(
        OutboundAttachment.user_id == user.id, OutboundAttachment.email_id.is_(None)))
    dropped = int(getattr(removed, "rowcount", 0) or 0)
    await get_redis().delete(Keys.compose_session(user.id))
    cancelled = getattr(result, "rowcount", 0)
    if cancelled or dropped:
        extra = f" and removed {dropped} attachment(s)" if dropped else ""
        await reply(db, user, f"🗑️ Cancelled{extra}.")
    else:
        await reply(db, user, "Nothing to cancel.")


async def _on_media(db: AsyncSession, user: User, inbound: Inbound, waha: WahaClient) -> bool:
    """Stage a received file as an attachment. Returns True if it was handled."""
    settings = get_settings()
    if not await get_redis().exists(Keys.compose_session(user.id)):
        await reply(db, user, "📎 To email a file, send */email* first, then the file, then the filled form.")
        return True
    media = inbound.media or {}
    if not media.get("url") or media.get("error"):
        await reply(db, user, "⚠️ I couldn't download that file from WhatsApp. Please send it again.")
        return True
    staged = await _staged(db, user.id)
    if len(staged) >= settings.compose_max_attachments:
        await reply(db, user, f"⚠️ At most {settings.compose_max_attachments} attachments per email.")
        return True
    room = settings.compose_max_total_bytes - sum(f.size for f in staged)
    try:
        content = await waha.download_media(str(media["url"]), min(settings.compose_max_file_bytes, room))
    except WahaError as exc:
        too_big = "too large" in str(exc)
        await reply(db, user, "⚠️ That file is too large to attach." if too_big
                    else "⚠️ I couldn't download that file from WhatsApp. Please send it again.")
        return True
    mime_type = str(media.get("mimetype") or "application/octet-stream").split(";")[0].strip()
    filename = str(media.get("filename") or "").strip()
    if not filename:
        ext = mimetypes.guess_extension(mime_type) or ".bin"
        stamp = datetime.now(UTC).astimezone(tz(user.timezone)).strftime("%Y%m%d-%H%M%S")
        filename = f"whatsapp-{stamp}{ext}"
    db.add(OutboundAttachment(id=uuid7(), user_id=user.id, wa_message_id=inbound.id, filename=filename[:255],
                              mime_type=mime_type[:127], size=len(content), content=content))
    await reply(db, user, f"📎 Attached *{filename}* ({cmd.human_size(len(content))}). "
                          f"{len(staged) + 1} file(s) ready – send the filled form when you're done.")
    return True


ALERT_COMMANDS = {cmd.Kind.open, cmd.Kind.remind, cmd.Kind.mute, cmd.Kind.unmute, cmd.Kind.muted,
                  cmd.Kind.recent, cmd.Kind.upcoming}


async def _alert_command(db: AsyncSession, user: User, command: cmd.Command) -> list[str]:
    """Commands that act on alerts work even when sending email from WhatsApp is turned off."""
    match command.kind:
        case cmd.Kind.open:
            return await actions.on_open(db, user, command.arg)
        case cmd.Kind.remind:
            return await actions.on_remind(db, user, command.arg)
        case cmd.Kind.mute:
            return await actions.on_mute(db, user, command.arg)
        case cmd.Kind.unmute:
            return await actions.on_unmute(db, user, command.arg)
        case cmd.Kind.muted:
            return await actions.on_muted(db, user)
        case cmd.Kind.recent:
            return await actions.on_recent(db, user)
        case _:
            return await actions.on_upcoming(db, user)


async def handle_inbound(payload: dict[str, Any]) -> str:
    """Entry point for every WhatsApp message WAHA reports (task `handle_whatsapp_message`)."""
    message_id = str(payload.get("id") or "")
    if not message_id or not await get_redis().set(Keys.inbound_seen(message_id), "1", nx=True,
                                                    ex=INBOUND_DEDUPE_S):
        return "duplicate"
    waha = WahaClient()
    inbound = await identify(payload, waha)
    if inbound is None:
        return "ignored"
    command = cmd.parse_command(inbound.text, quoted=inbound.quoted)
    to_send: list[UUID] = []  # confirmed inside this transaction; sent after commit
    async with session_factory()() as db:
        user = await db.scalar(select(User).where(User.phone_e164 == inbound.sender_phone,
                                                  User.is_active.is_(True)))
        if user is None:
            return "unknown_sender"
        if command.kind in ALERT_COMMANDS:
            texts = await _alert_command(db, user, command)
            await reply(db, user, *texts)
        elif command.kind == cmd.Kind.text and not inbound.has_media:
            # Ordinary chat (or notes to self): only nudge if a draft is waiting.
            waiting = await db.scalar(select(func.count()).select_from(OutboundEmail).where(
                OutboundEmail.user_id == user.id, OutboundEmail.status == OutboundStatus.awaiting_confirmation))
            if not waiting:
                return "ignored"
            await reply(db, user, "Reply *YES* to send the email waiting for confirmation, or *NO* to cancel.")
        else:
            prefs = await db.get(UserSettings, user.id)
            if prefs is not None and not prefs.compose_enabled:
                await reply(db, user, "Sending email from WhatsApp is turned off. Turn it on in the app under "
                                      "*Settings*.")
            else:
                if inbound.has_media:
                    await _on_media(db, user, inbound, waha)
                match command.kind:
                    case cmd.Kind.email:
                        await _on_email(db, user, command.arg)
                    case cmd.Kind.templates:
                        await _on_templates(db, user)
                    case cmd.Kind.reply:
                        await _on_reply(db, user, command.arg)
                    case cmd.Kind.send:
                        await _on_send(db, user, command.raw)
                    case cmd.Kind.confirm:
                        if confirmed := await _on_confirm(db, user):
                            to_send.append(confirmed)
                    case cmd.Kind.cancel:
                        await _on_cancel(db, user)
                    case cmd.Kind.help | cmd.Kind.unknown_command:
                        await reply(db, user, cmd.HELP)
                    case cmd.Kind.text:
                        pass  # a caption on an attachment
        user_id = user.id
        await db.commit()
    await events.wake_dispatcher()
    for email_id in to_send:
        await events.publish(user_id, "email.updated", {"id": str(email_id), "status": "queued"})
        if kick_send is not None:
            await kick_send(str(email_id))
    return command.kind.value


# ---------------------------------------------------------------- sending


async def send_outbound(email_id: UUID) -> str:
    async with session_factory()() as db:
        claimed = await db.scalar(update(OutboundEmail).where(
            OutboundEmail.id == email_id, OutboundEmail.status == OutboundStatus.queued,
        ).values(status=OutboundStatus.sending).returning(OutboundEmail.id))
        await db.commit()
        if claimed is None:
            return "not_queued"
        email = await db.get(OutboundEmail, email_id)
        assert email is not None
        user = await db.get(User, email.user_id)
        mailbox = await db.get(Mailbox, email.mailbox_id) if email.mailbox_id else None
        files = (await db.scalars(select(OutboundAttachment).where(OutboundAttachment.email_id == email.id)
                                  .order_by(OutboundAttachment.created_at)
                                  .execution_options(populate_existing=True))).all()
        error: str | None = None
        try:
            if mailbox is None or not mailbox.can_send:
                raise SendError("The mailbox is no longer connected or can't send", retryable=False)
            outgoing = [OutgoingFile(f.filename, f.mime_type, await _content(db, f.id)) for f in files]
            message = build_message(
                from_address=mailbox.address, from_name=mailbox.display_name or (user.display_name if user else None),
                to=email.to_addresses, cc=email.cc_addresses, subject=email.subject, body=email.body,
                files=outgoing, in_reply_to=email.in_reply_to, references=email.references,
            )
            creds = vault().decrypt_json(mailbox.credentials)
            provider_id = await _deliver(mailbox, creds, message, email)
            email.status = OutboundStatus.sent
            email.provider_message_id = provider_id[:255]
            email.sent_at = datetime.now(UTC)
            email.error = None
        except ReauthRequired as exc:
            error = str(exc)
            if mailbox is not None:
                mailbox.status = MailboxStatus.reauth_required
                mailbox.last_error = error
        except (SendError, ProviderError) as exc:
            error = str(exc)
        if error:
            email.status = OutboundStatus.failed
            email.error = error[:1000]
            log.warning("outbound_email_failed", email_id=str(email.id), error=error)
        if user is not None:
            recipients = ", ".join([*email.to_addresses, *email.cc_addresses])
            if error:
                await reply(db, user, f"❌ Couldn't send *{email.subject or '(no subject)'}*: {error}")
            else:
                await reply(db, user, f"✅ Sent *{email.subject or '(no subject)'}* to {recipients} "
                                      f"from {email.from_address}.")
        status = email.status
        user_id = email.user_id
        await db.commit()
    await events.wake_dispatcher()
    await events.publish(user_id, "email.updated", {"id": str(email_id), "status": status.value})
    return status.value


async def _content(db: AsyncSession, attachment_id: UUID) -> bytes:
    content = await db.scalar(select(OutboundAttachment.content).where(OutboundAttachment.id == attachment_id))
    if content is None:
        raise SendError("An attachment is no longer available", retryable=False)
    return bytes(content)


async def _deliver(mailbox: Mailbox, creds: dict[str, Any], message: Any, email: OutboundEmail) -> str:
    async for attempt in stamina.retry_context(on=_retryable, attempts=3, wait_initial=2.0, wait_max=30.0):
        with attempt:
            if mailbox.provider == Provider.gmail:
                session = GmailSession(mailbox.id, mailbox.address, creds)
                provider_id = await send_gmail(session, message, email.bcc_addresses, email.provider_thread_id)
                if session.credentials != creds:
                    mailbox.credentials = vault().encrypt_json(session.credentials)
                return provider_id
            recipients = [*email.to_addresses, *email.cc_addresses, *email.bcc_addresses]
            return await send_smtp(creds, message, recipients)
    raise SendError("unreachable", retryable=False)  # pragma: no cover


def _retryable(exc: Exception) -> bool:
    return isinstance(exc, SendError) and exc.retryable


async def expire_drafts() -> int:
    """Expire unconfirmed drafts and drop stale staged files."""
    now = datetime.now(UTC)
    async with session_factory()() as db:
        expired = await db.execute(update(OutboundEmail).where(
            OutboundEmail.status == OutboundStatus.awaiting_confirmation, OutboundEmail.confirm_expires_at < now,
        ).values(status=OutboundStatus.expired))
        await db.execute(delete(OutboundAttachment).where(
            OutboundAttachment.email_id.is_(None),
            OutboundAttachment.created_at < now - timedelta(seconds=get_settings().compose_session_ttl_s * 2)))
        # Keep metadata for the log, drop file contents a week after the email is done.
        finished = select(OutboundEmail.id).where(
            OutboundEmail.status.in_([OutboundStatus.sent, OutboundStatus.failed, OutboundStatus.cancelled,
                                      OutboundStatus.expired]),
            OutboundEmail.updated_at < now - timedelta(days=7))
        await db.execute(update(OutboundAttachment).where(OutboundAttachment.email_id.in_(finished),
                                                          OutboundAttachment.content.is_not(None))
                         .values(content=None))
        await db.commit()
        return int(getattr(expired, "rowcount", 0) or 0)
