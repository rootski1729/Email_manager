from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import and_, or_, select

from app.api.deps import DB, CurrentUser
from app.api.routes.messages import decode_cursor, encode_cursor
from app.api.schemas import AttachmentOut, OutboundEmailDetail, OutboundEmailOut, Page
from app.core.errors import AppError, NotFound
from app.models import OutboundAttachment, OutboundEmail, OutboundStatus
from app.services import events

router = APIRouter(prefix="/outbound-emails", tags=["email templates"])


async def _attachments(db: DB, ids: list[UUID]) -> dict[UUID, list[AttachmentOut]]:
    found: dict[UUID, list[AttachmentOut]] = {i: [] for i in ids}
    if ids:
        rows = (await db.scalars(select(OutboundAttachment).where(OutboundAttachment.email_id.in_(ids))
                                 .order_by(OutboundAttachment.created_at))).all()
        for a in rows:
            if a.email_id is not None:
                found[a.email_id].append(AttachmentOut.model_validate(a))
    return found


@router.get("", response_model=Page[OutboundEmailOut])
async def list_outbound(
    user: CurrentUser, db: DB, status: OutboundStatus | None = None, cursor: str | None = None,
    limit: int = Query(30, ge=1, le=100),
) -> Page[OutboundEmailOut]:
    stmt = select(OutboundEmail).where(OutboundEmail.user_id == user.id)
    if status:
        stmt = stmt.where(OutboundEmail.status == status)
    if cursor:
        at, id_ = decode_cursor(cursor)
        stmt = stmt.where(or_(OutboundEmail.created_at < at,
                              and_(OutboundEmail.created_at == at, OutboundEmail.id < id_)))
    rows = (await db.scalars(stmt.order_by(OutboundEmail.created_at.desc(), OutboundEmail.id.desc())
                             .limit(limit + 1))).all()
    page = rows[:limit]
    files = await _attachments(db, [e.id for e in page])
    items = [OutboundEmailOut.model_validate(e).model_copy(update={"attachments": files[e.id]}) for e in page]
    return Page(items=items,
                next_cursor=encode_cursor(page[-1].created_at, page[-1].id) if len(rows) > limit else None)


@router.get("/{email_id}", response_model=OutboundEmailDetail)
async def get_outbound(email_id: UUID, user: CurrentUser, db: DB) -> OutboundEmailDetail:
    email = await db.get(OutboundEmail, email_id)
    if email is None or email.user_id != user.id:
        raise NotFound("Email not found")
    files = await _attachments(db, [email.id])
    return OutboundEmailDetail.model_validate(email).model_copy(update={"attachments": files[email.id]})


@router.post("/{email_id}/cancel", response_model=OutboundEmailDetail)
async def cancel_outbound(email_id: UUID, user: CurrentUser, db: DB) -> OutboundEmailDetail:
    email = await db.get(OutboundEmail, email_id)
    if email is None or email.user_id != user.id:
        raise NotFound("Email not found")
    if email.status != OutboundStatus.awaiting_confirmation:
        raise AppError("Only emails waiting for confirmation can be cancelled", code="not_cancellable")
    email.status = OutboundStatus.cancelled
    await db.commit()
    await events.publish(user.id, "email.updated", {"id": str(email.id), "status": "cancelled"})
    return await get_outbound(email_id, user, db)
