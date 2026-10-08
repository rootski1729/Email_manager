import base64
from datetime import UTC, datetime
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Query, Response
from sqlalchemy import Select, and_, or_, select, update

from app.api.deps import DB, CurrentUser
from app.api.schemas import (
    EmailFileOut,
    EventOut,
    MatchOut,
    MessageContent,
    MessageDetail,
    MessageOut,
    MuteOut,
    MuteRequest,
    NotificationOut,
    Page,
    RemindOut,
    RemindRequest,
    ThreadMessageOut,
)
from app.compose.when import describe, parse_when
from app.core.errors import AppError, NotFound, UpstreamError
from app.models import (
    Event,
    Mailbox,
    Message,
    Notification,
    NotificationKind,
    NotificationStatus,
    RuleMatch,
    UserSettings,
)
from app.notify import wa
from app.notify.templates import render_payload
from app.rules.envelope import domain_of
from app.services import alert_actions as actions
from app.services import mail_content, outbox
from app.services.events import wake_dispatcher
from app.services.schedule import tz

router = APIRouter(tags=["messages"])


def encode_cursor(at: datetime, id_: UUID) -> str:
    return base64.urlsafe_b64encode(f"{at.isoformat()}|{id_}".encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    try:
        at, id_ = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        return datetime.fromisoformat(at), UUID(id_)
    except ValueError as exc:
        raise AppError("Invalid cursor", code="invalid_cursor", status=422) from exc


def _escape_like(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/messages", response_model=Page[MessageOut])
async def list_messages(
    user: CurrentUser, db: DB,
    mailbox_id: UUID | None = None, rule_id: UUID | None = None,
    q: str | None = Query(None, max_length=200), cursor: str | None = None,
    limit: int = Query(30, ge=1, le=100),
) -> Page[MessageOut]:
    stmt: Select = (select(Message, Mailbox.address).join(Mailbox, Mailbox.id == Message.mailbox_id)
                    .where(Message.user_id == user.id))
    if mailbox_id:
        stmt = stmt.where(Message.mailbox_id == mailbox_id)
    if rule_id:
        stmt = stmt.where(Message.id.in_(select(RuleMatch.message_id).where(RuleMatch.rule_id == rule_id)))
    if q:
        like = f"%{_escape_like(q)}%"
        stmt = stmt.where(or_(Message.subject.ilike(like), Message.from_address.ilike(like),
                              Message.from_name.ilike(like)))
    if cursor:
        at, id_ = decode_cursor(cursor)
        stmt = stmt.where(or_(Message.received_at < at, and_(Message.received_at == at, Message.id < id_)))
    rows = (await db.execute(stmt.order_by(Message.received_at.desc(), Message.id.desc()).limit(limit + 1))).all()
    page = rows[:limit]
    ids = [m.id for m, _ in page]
    rules: dict[UUID, list[str]] = {i: [] for i in ids}
    if ids:
        for message_id, name in (await db.execute(
            select(RuleMatch.message_id, RuleMatch.rule_name).where(RuleMatch.message_id.in_(ids))
        )).all():
            rules[message_id].append(name)
    items = [MessageOut.model_validate(m).model_copy(update={"mailbox_address": address, "rules": rules[m.id]})
             for m, address in page]
    next_cursor = encode_cursor(page[-1][0].received_at, page[-1][0].id) if len(rows) > limit else None
    return Page(items=items, next_cursor=next_cursor)


def notification_out(n: Notification) -> NotificationOut:
    out = NotificationOut.model_validate(n)
    out.subject = n.payload.get("subject") or n.payload.get("title")
    if not n.body:
        out.preview = render_payload(n.kind.value, n.payload)[:500]
    return out


@router.get("/messages/{message_id}", response_model=MessageDetail)
async def get_message(message_id: UUID, user: CurrentUser, db: DB) -> MessageDetail:
    message = await db.get(Message, message_id)
    if message is None or message.user_id != user.id:
        raise NotFound("Message not found")
    mailbox = await db.get(Mailbox, message.mailbox_id)
    matches = (await db.scalars(select(RuleMatch).where(RuleMatch.message_id == message.id))).all()
    notes = (await db.scalars(select(Notification).where(Notification.message_id == message.id)
                              .order_by(Notification.created_at))).all()
    base = MessageOut.model_validate(message).model_dump()
    return MessageDetail(
        **{**base, "mailbox_address": mailbox.address if mailbox else None,
           "rules": [m.rule_name for m in matches]},
        to_addresses=message.to_addresses, list_id=message.list_id, thread_id=message.thread_id,
        matches=[MatchOut.model_validate(m) for m in matches],
        notifications=[notification_out(n) for n in notes],
        events=[EventOut.model_validate(e).model_copy(update={"message_subject": message.subject,
                                                              "message_ref": message.ref})
                for e in (await db.scalars(select(Event).where(Event.message_id == message.id)
                                           .order_by(Event.starts_at))).all()],
    )


# Types a browser could render or run if opened directly; served as plain downloads instead.
_UNSAFE_TYPES = ("text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", "application/xml",
                 "text/javascript", "application/javascript")


async def _own_message(db: DB, user_id: UUID, message_id: UUID) -> Message:
    message = await db.get(Message, message_id)
    if message is None or message.user_id != user_id:
        raise NotFound("Message not found")
    return message


@router.get("/messages/{message_id}/content", response_model=MessageContent)
async def get_message_content(message_id: UUID, user: CurrentUser, db: DB) -> MessageContent:
    """The full email, its earlier thread and its attachments, read live from the mailbox (nothing is stored)."""
    message = await _own_message(db, user.id, message_id)
    try:
        full = await mail_content.fetch_full(db, message)
    except mail_content.ContentError as exc:
        raise UpstreamError(str(exc)) from exc
    env, reading = full.env, full.reading
    files = [EmailFileOut(index=i, name=a.name or f"attachment-{i + 1}", mime_type=a.mime_type, size=a.size)
             for i, a in enumerate(env.attachments)]
    shown = {f["index"] for f in wa.meaningful_files([{**f.model_dump(), "type": f.mime_type} for f in files])}
    formatted = full.html()
    return MessageContent(
        html=formatted.html if formatted else None, remote_images=formatted.remote_images if formatted else 0,
        kind=reading.kind, subject=env.subject, from_name=env.from_name, from_address=env.from_address,
        to=env.to, cc=env.cc, received_at=env.received_at,
        text=(reading.forwarded_body if reading.kind == "forward" else reading.latest) or env.snippet or "",
        note=reading.latest if reading.kind == "forward" and reading.latest else None,
        forwarded_from=reading.forwarded_from or None, forwarded_subject=reading.forwarded_subject or None,
        thread=[ThreadMessageOut(sender=t.sender, sent=t.sent, text=t.text) for t in full.thread],
        attachments=[f for f in files if f.index in shown], web_url=message.web_url,
    )


@router.get("/messages/{message_id}/attachments/{index}", response_class=Response,
            responses={200: {"content": {"application/octet-stream": {}}}})
async def download_attachment(message_id: UUID, index: int, user: CurrentUser, db: DB) -> Response:
    message = await _own_message(db, user.id, message_id)
    try:
        parts = (await mail_content.fetch_full(db, message)).files()
    except mail_content.ContentError as exc:
        raise UpstreamError(str(exc)) from exc
    if not 0 <= index < len(parts):
        raise NotFound("Attachment not found")
    part = parts[index]
    name = part.name or f"attachment-{index + 1}"
    media_type = "application/octet-stream" if part.mime_type in _UNSAFE_TYPES else part.mime_type
    ascii_name = name.encode("ascii", "ignore").decode().replace('"', "") or "attachment"
    return Response(content=part.data, media_type=media_type, headers={
        "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}",
        "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"})


@router.post("/messages/{message_id}/remind", response_model=RemindOut, status_code=201)
async def remind_message(message_id: UUID, body: RemindRequest, user: CurrentUser, db: DB) -> RemindOut:
    """Bring this email back on WhatsApp later (same as /remind K7 on WhatsApp)."""
    message = await db.get(Message, message_id)
    if message is None or message.user_id != user.id:
        raise NotFound("Message not found")
    zone, now = tz(user.timezone), datetime.now(UTC)
    at = body.at or (parse_when(body.when, now=now, zone=zone) if body.when else None)
    if at is None:
        raise AppError("Give a time: `at`, or `when` like '2h', 'tomorrow 9am'", code="invalid_time", status=422)
    if at.tzinfo is None:
        at = at.replace(tzinfo=zone)
    if at <= now:
        raise AppError("The reminder time must be in the future", code="invalid_time", status=422)
    destination = await outbox.default_destination(db, user.id)
    if destination is None:
        raise AppError("Add a verified WhatsApp destination first", code="no_destination", status=422)
    await outbox.enqueue(db, user_id=user.id, destination=destination, kind=NotificationKind.reminder,
                         payload=await actions.message_payload(db, message, user),
                         dedupe=f"remind:{message.id}:{at.isoformat()}", message_id=message.id,
                         at=at)
    await db.commit()
    return RemindOut(at=at, description=describe(at, now=now, zone=zone))


@router.post("/messages/{message_id}/mute", response_model=MuteOut)
async def mute_sender(message_id: UUID, body: MuteRequest, user: CurrentUser, db: DB) -> MuteOut:
    """Stop WhatsApp alerts from this email's sender (or its whole domain). Matches still show in the app."""
    message = await db.get(Message, message_id)
    if message is None or message.user_id != user.id:
        raise NotFound("Message not found")
    target = domain_of(message.from_address) if body.scope == "domain" else message.from_address.lower()
    prefs = await db.get(UserSettings, user.id)
    if prefs is None:
        prefs = UserSettings(user_id=user.id, quiet_hours={}, digest={})
        db.add(prefs)
    muted = list(prefs.muted_senders or [])
    if target not in muted:
        if len(muted) >= actions.MAX_MUTED:
            raise AppError(f"You've muted {actions.MAX_MUTED} senders already; remove some in Settings",
                           code="mute_limit", status=422)
        prefs.muted_senders = [*muted, target]
    await db.commit()
    return MuteOut(muted=target, muted_senders=list(prefs.muted_senders))


@router.delete("/messages/{message_id}", status_code=204)
async def delete_message(message_id: UUID, user: CurrentUser, db: DB) -> None:
    message = await db.get(Message, message_id)
    if message is None or message.user_id != user.id:
        raise NotFound("Message not found")
    await db.delete(message)
    await db.commit()


@router.get("/notifications", response_model=Page[NotificationOut])
async def list_notifications(
    user: CurrentUser, db: DB, status: NotificationStatus | None = None,
    cursor: str | None = None, limit: int = Query(30, ge=1, le=100),
) -> Page[NotificationOut]:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if status:
        stmt = stmt.where(Notification.status == status)
    if cursor:
        at, id_ = decode_cursor(cursor)
        stmt = stmt.where(or_(Notification.created_at < at,
                              and_(Notification.created_at == at, Notification.id < id_)))
    rows = (await db.scalars(stmt.order_by(Notification.created_at.desc(), Notification.id.desc())
                             .limit(limit + 1))).all()
    page = rows[:limit]
    return Page(items=[notification_out(n) for n in page],
                next_cursor=encode_cursor(page[-1].created_at, page[-1].id) if len(rows) > limit else None)


@router.post("/notifications/{notification_id}/retry", response_model=NotificationOut)
async def retry_notification(notification_id: UUID, user: CurrentUser, db: DB) -> NotificationOut:
    n = await db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise NotFound("Notification not found")
    if n.status not in (NotificationStatus.dead, NotificationStatus.failed):
        raise AppError("Only failed deliveries can be retried", code="not_retryable")
    await db.execute(update(Notification).where(Notification.id == n.id).values(
        status=NotificationStatus.queued, attempts=0, last_error=None, next_attempt_at=datetime.now(UTC)))
    await db.commit()
    await db.refresh(n)
    await wake_dispatcher()
    return notification_out(n)
