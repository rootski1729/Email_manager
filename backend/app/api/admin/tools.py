"""Test lab: try a rule, the date finder, a WhatsApp message or a mailbox login without touching real data."""

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Request

from app.api.admin.schemas import (
    CheckResult,
    ToolDateFound,
    ToolDates,
    ToolMailbox,
    ToolRuleResult,
    ToolRuleTest,
    ToolWhatsApp,
)
from app.api.deps import AdminUser, client_ip
from app.compose.mailer import SendError, verify_smtp
from app.core.db import session_factory
from app.core.errors import AppError
from app.core.security import normalize_phone, phone_to_chat_id
from app.events.extract import day_first_for, from_text
from app.models import Provider
from app.notify.direct import send_now
from app.notify.waha import WahaError
from app.providers import get_provider
from app.providers.base import ProviderError, ReauthRequired
from app.rules.engine import compile_condition, parse_condition
from app.rules.envelope import Attachment, Envelope
from app.rules.schema import AllOf, AnyOf, Condition, NotOf, Predicate
from app.services import admin_auth
from app.services.deadlines import AUTO_CONFIRM
from app.services.schedule import tz

router = APIRouter(prefix="/admin/tools", tags=["admin"])

FIELD_WORDS = {"from.address": "sender address", "from.domain": "sender domain", "from.name": "sender name",
               "subject": "subject", "body": "body", "anywhere": "anywhere in the email", "to": "To",
               "cc": "Cc", "recipients": "To or Cc", "reply_to": "Reply-To", "list_id": "mailing list",
               "attachment.name": "attachment name", "attachment.type": "attachment type",
               "has_attachment": "has an attachment"}
OP_WORDS = {"equals": "is", "contains": "contains", "contains_all": "contains all of", "starts_with": "starts with",
            "ends_with": "ends with", "regex": "matches the pattern", "exists": "exists",
            "domain_matches": "is (or is under) the domain", "is": "is"}


def _describe(p: Predicate) -> str:
    field = FIELD_WORDS.get(p.field, p.field.replace("header:", "header "))
    value = p.value if not isinstance(p.value, list) else " / ".join(p.value)
    return f"{field} {OP_WORDS.get(p.op.value, p.op.value)}" + ("" if p.op.value == "exists" else f" “{value}”")


def explain(cond: Condition, env: Envelope, depth: int = 0) -> list[str]:
    """One line per node: ✓/✗ plus a plain-words description."""
    ok = compile_condition(cond)(env)
    mark, pad = ("✓" if ok else "✗"), "    " * depth
    if isinstance(cond, AllOf):
        lines = [f"{pad}{mark} all of these:"]
        for child in cond.all:
            lines += explain(child, env, depth + 1)
        return lines
    if isinstance(cond, AnyOf):
        lines = [f"{pad}{mark} any of these:"]
        for child in cond.any:
            lines += explain(child, env, depth + 1)
        return lines
    if isinstance(cond, NotOf):
        return [f"{pad}{mark} none of these:", *explain(cond.not_, env, depth + 1)]
    return [f"{pad}{mark} {_describe(cond)}"]


@router.post("/rule", response_model=ToolRuleResult)
async def test_rule(body: ToolRuleTest, _: AdminUser) -> ToolRuleResult:
    try:
        cond = parse_condition(body.condition)
    except ValueError as exc:
        raise AppError(f"The condition isn't valid: {exc}", code="invalid_condition", status=422) from exc
    env = Envelope(
        mailbox_id=uuid4(), provider_message_id="test", received_at=datetime.now(UTC),
        from_address=body.from_address.lower(), from_name=body.from_name, to=[t.lower() for t in body.to],
        subject=body.subject, body_text=body.body, snippet=body.body[:200],
        headers={k.lower(): [v] for k, v in body.headers.items()},
        attachments=[Attachment(name=n, mime_type="application/octet-stream") for n in body.attachment_names],
    )
    return ToolRuleResult(matched=compile_condition(cond)(env), explanation=explain(cond, env))


@router.post("/dates", response_model=list[ToolDateFound])
async def test_dates(body: ToolDates, _: AdminUser) -> list[ToolDateFound]:
    zone = tz(body.timezone)
    found = from_text(body.subject, body.body, received_at=body.received_at or datetime.now(UTC), zone=zone,
                      day_first=day_first_for(body.timezone))
    return [ToolDateFound(kind=f.kind.value, title=f.title, starts_at=f.starts_at, all_day=f.all_day,
                          confidence=f.confidence, context=f.context,
                          status="upcoming (reminders on)" if f.confidence >= AUTO_CONFIRM else "suggested")
            for f in found]


@router.post("/whatsapp", response_model=CheckResult)
async def test_whatsapp(body: ToolWhatsApp, admin: AdminUser, request: Request) -> CheckResult:
    phone = normalize_phone(body.phone)
    if phone is None:
        raise AppError("Enter a valid phone number with country code", code="invalid_phone", status=422)
    try:
        message_id = await send_now(phone_to_chat_id(phone), body.text)
        result = CheckResult(ok=True, title="Sent", detail=f"WhatsApp accepted the message ({message_id})")
    except WahaError as exc:
        result = CheckResult(ok=False, title="Not sent", detail=str(exc))
    async with session_factory()() as db:
        await admin_auth.record(db, admin, "tools.whatsapp_test", target_type="phone", target_id=phone,
                                details={"ok": result.ok}, ip=client_ip(request))
        await db.commit()
    return result


@router.post("/mailbox", response_model=list[CheckResult])
async def test_mailbox(body: ToolMailbox, _: AdminUser) -> list[CheckResult]:
    """Log in to IMAP (and SMTP when given) with these details. Nothing is saved."""
    results: list[CheckResult] = []
    creds: dict[str, Any] = body.credentials.model_dump()
    try:
        async with get_provider(Provider.imap).open(uuid4(), body.address, creds) as session:
            recent = await session.recent(1)
        results.append(CheckResult(ok=True, title="Reading mail (IMAP)",
                                   detail=f"Logged in; the {body.credentials.folder} folder is readable"
                                          + ("" if recent else " (it's empty)")))
    except ReauthRequired as exc:
        results.append(CheckResult(ok=False, title="Reading mail (IMAP)", detail=str(exc)))
    except (ProviderError, OSError, TimeoutError) as exc:
        results.append(CheckResult(ok=False, title="Reading mail (IMAP)", detail=f"Can't connect: {exc}"))
    if body.credentials.smtp_host:
        try:
            await verify_smtp(body.credentials)
            results.append(CheckResult(ok=True, title="Sending mail (SMTP)", detail="Logged in"))
        except SendError as exc:
            results.append(CheckResult(ok=False, title="Sending mail (SMTP)", detail=str(exc)))
    return results
