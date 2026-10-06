from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.api.deps import DB, CurrentUser
from app.api.schemas import EmailTemplateCreate, EmailTemplateOut, EmailTemplateUpdate, TemplatePreview
from app.compose import commands as cmd
from app.core.config import PLANS
from app.core.db import uuid7
from app.core.errors import AppError, Conflict, LimitReached, NotFound
from app.models import EmailTemplate, Mailbox
from app.services.compose import pick_mailbox, sending_mailboxes, template_values

router = APIRouter(prefix="/email-templates", tags=["email templates"])


async def _get(db: DB, user_id: UUID, template_id: UUID) -> EmailTemplate:
    template = await db.get(EmailTemplate, template_id)
    if template is None or template.user_id != user_id:
        raise NotFound("Template not found")
    return template


async def _check_mailbox(db: DB, user_id: UUID, mailbox_id: UUID | None) -> None:
    if mailbox_id is None:
        return
    mailbox = await db.get(Mailbox, mailbox_id)
    if mailbox is None or mailbox.user_id != user_id:
        raise AppError("Unknown mailbox", code="invalid_reference", status=422)
    if not mailbox.can_send:
        raise AppError(f"{mailbox.address} can't send email yet", code="mailbox_cannot_send", status=422)


async def _clear_default(db: DB, user_id: UUID, keep: UUID) -> None:
    await db.execute(update(EmailTemplate).where(EmailTemplate.user_id == user_id, EmailTemplate.id != keep)
                     .values(is_default=False))


@router.get("", response_model=list[EmailTemplateOut])
async def list_templates(user: CurrentUser, db: DB) -> list[EmailTemplate]:
    return list((await db.scalars(select(EmailTemplate).where(EmailTemplate.user_id == user.id)
                                  .order_by(EmailTemplate.is_default.desc(), EmailTemplate.name))).all())


@router.post("", response_model=EmailTemplateOut, status_code=201)
async def create_template(body: EmailTemplateCreate, user: CurrentUser, db: DB) -> EmailTemplate:
    limit = PLANS.get(user.plan, PLANS["free"]).templates
    count = await db.scalar(select(func.count()).select_from(EmailTemplate)
                            .where(EmailTemplate.user_id == user.id)) or 0
    if count >= limit:
        raise LimitReached(f"Your plan allows {limit} templates")
    await _check_mailbox(db, user.id, body.mailbox_id)
    template = EmailTemplate(id=uuid7(), user_id=user.id, **body.model_dump())
    if count == 0:
        template.is_default = True  # the first template answers a plain /email
    if template.is_default:
        await _clear_default(db, user.id, template.id)
    db.add(template)
    try:
        await db.commit()
    except IntegrityError as exc:
        raise Conflict(f"You already have a template called '{body.name}'") from exc
    return template


@router.get("/{template_id}", response_model=EmailTemplateOut)
async def get_template(template_id: UUID, user: CurrentUser, db: DB) -> EmailTemplate:
    return await _get(db, user.id, template_id)


@router.patch("/{template_id}", response_model=EmailTemplateOut)
async def update_template(template_id: UUID, body: EmailTemplateUpdate, user: CurrentUser, db: DB) -> EmailTemplate:
    template = await _get(db, user.id, template_id)
    data = body.model_dump(exclude_unset=True)
    if "mailbox_id" in data:
        await _check_mailbox(db, user.id, data["mailbox_id"])
    for key, value in data.items():
        if value is None and key not in ("description", "mailbox_id"):
            continue
        setattr(template, key, value)
    if data.get("is_default"):
        await _clear_default(db, user.id, template.id)
    try:
        await db.commit()
    except IntegrityError as exc:
        raise Conflict(f"You already have a template called '{body.name}'") from exc
    await db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
async def delete_template(template_id: UUID, user: CurrentUser, db: DB) -> None:
    template = await _get(db, user.id, template_id)
    was_default = template.is_default
    await db.delete(template)
    await db.flush()
    if was_default:
        replacement = await db.scalar(select(EmailTemplate).where(EmailTemplate.user_id == user.id)
                                      .order_by(EmailTemplate.use_count.desc(), EmailTemplate.created_at).limit(1))
        if replacement:
            replacement.is_default = True
    await db.commit()


@router.get("/{template_id}/preview", response_model=TemplatePreview)
async def preview_template(template_id: UUID, user: CurrentUser, db: DB) -> TemplatePreview:
    """Exactly what the bot sends on WhatsApp for `/email <name>`."""
    template = await _get(db, user.id, template_id)
    mailbox = pick_mailbox(await sending_mailboxes(db, user.id), template.mailbox_id)
    return TemplatePreview(
        command=f"/email {template.name}", instructions=cmd.INSTRUCTIONS,
        form=cmd.render_form(template_values(template, mailbox, user)),
    )
