import base64
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import Select, and_, or_, select, update

from app.api.deps import DB, CurrentUser
from app.api.schemas import MatchOut, MessageDetail, MessageOut, NotificationOut, Page
from app.core.errors import AppError, NotFound
from app.models import Mailbox, Message, Notification, NotificationStatus, RuleMatch
from app.notify.templates import render_payload
from app.services.events import wake_dispatcher

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
    )


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
