import asyncio
import dataclasses
import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser
from app.api.schemas import (
    FieldInfo,
    RuleCreate,
    RuleOrder,
    RuleOut,
    RuleTest,
    RuleTestHit,
    RuleTestOut,
    RuleUpdate,
    dump_condition,
)
from app.core.config import PLANS
from app.core.db import uuid7
from app.core.errors import AppError, LimitReached, NotFound, UpstreamError
from app.core.redis import Keys, get_redis
from app.core.security import vault
from app.models import Destination, Mailbox, Rule
from app.providers import get_provider
from app.providers.base import ProviderError
from app.rules.engine import compile_condition
from app.rules.envelope import Attachment, Envelope
from app.rules.schema import FULL_MESSAGE_FIELDS, Op
from app.services.rulesets import bump_version

router = APIRouter(prefix="/rules", tags=["rules"])
PREVIEW_TTL_S = 300
_TEXT = [Op.equals, Op.contains, Op.contains_all, Op.starts_with, Op.ends_with, Op.regex, Op.exists]
_ADDR = [Op.domain_matches, *_TEXT]
FIELDS: list[tuple[str, str, list[Op]]] = [
    ("from.address", "Sender address", _ADDR),
    ("from.domain", "Sender domain (includes subdomains)", [Op.domain_matches, Op.equals, Op.ends_with, Op.regex]),
    ("from.name", "Sender name", _TEXT),
    ("to", "To", _ADDR),
    ("cc", "Cc", _ADDR),
    ("recipients", "To or Cc", _ADDR),
    ("reply_to", "Reply-To", _ADDR),
    ("subject", "Subject", _TEXT),
    ("body", "Body text", _TEXT),
    ("anywhere", "Anywhere (sender, subject, body, attachments)", _TEXT),
    ("list_id", "Mailing list (List-Id)", _TEXT),
    ("header:", "Any header (enter a name, e.g. header:X-Priority)", _TEXT),
    ("attachment.name", "Attachment file name", _TEXT),
    ("attachment.type", "Attachment type", _TEXT),
    ("has_attachment", "Has attachment", [Op.is_]),
]


async def _get(db: DB, user_id: UUID, rule_id: UUID) -> Rule:
    rule = await db.get(Rule, rule_id)
    if rule is None or rule.user_id != user_id:
        raise NotFound("Rule not found")
    return rule


async def _check_refs(db: DB, user_id: UUID, mailbox_ids: list[UUID] | None, dest_ids: list[UUID]) -> None:
    if mailbox_ids:
        found = set((await db.scalars(select(Mailbox.id).where(
            Mailbox.user_id == user_id, Mailbox.id.in_(mailbox_ids)))).all())
        if found != set(mailbox_ids):
            raise AppError("Unknown mailbox in rule scope", code="invalid_reference", status=422)
    if dest_ids:
        found = set((await db.scalars(select(Destination.id).where(
            Destination.user_id == user_id, Destination.id.in_(dest_ids)))).all())
        if found != set(dest_ids):
            raise AppError("Unknown destination in rule actions", code="invalid_reference", status=422)


@router.get("/fields", response_model=list[FieldInfo])
async def rule_fields() -> list[FieldInfo]:
    return [FieldInfo(field=f, label=label, ops=[o.value for o in ops], needs_full_message=f in FULL_MESSAGE_FIELDS)
            for f, label, ops in FIELDS]


@router.get("", response_model=list[RuleOut])
async def list_rules(user: CurrentUser, db: DB) -> list[Rule]:
    return list((await db.scalars(
        select(Rule).where(Rule.user_id == user.id).order_by(Rule.position, Rule.created_at))).all())


@router.post("", response_model=RuleOut, status_code=201)
async def create_rule(body: RuleCreate, user: CurrentUser, db: DB) -> Rule:
    count = await db.scalar(select(func.count()).select_from(Rule).where(Rule.user_id == user.id)) or 0
    limit = PLANS.get(user.plan, PLANS["free"]).rules
    if count >= limit:
        raise LimitReached(f"Your plan allows {limit} rules")
    notify = body.actions.notify
    await _check_refs(db, user.id, body.mailbox_ids, notify.destinations if notify else [])
    position = (await db.scalar(select(func.max(Rule.position)).where(Rule.user_id == user.id)) or 0) + 1
    rule = Rule(id=uuid7(), user_id=user.id, position=position,
                **body.model_dump(exclude={"actions", "condition"}), condition=dump_condition(body.condition),
                actions=body.actions.model_dump(mode="json"))
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    await bump_version(user.id)
    return rule


@router.get("/{rule_id}", response_model=RuleOut)
async def get_rule(rule_id: UUID, user: CurrentUser, db: DB) -> Rule:
    return await _get(db, user.id, rule_id)


@router.patch("/{rule_id}", response_model=RuleOut)
async def update_rule(rule_id: UUID, body: RuleUpdate, user: CurrentUser, db: DB) -> Rule:
    rule = await _get(db, user.id, rule_id)
    data = body.model_dump(exclude_unset=True)
    notify = body.actions.notify if body.actions else None
    await _check_refs(db, user.id, data.get("mailbox_ids"), notify.destinations if notify else [])
    if "actions" in data and body.actions is not None:
        data["actions"] = body.actions.model_dump(mode="json")
    if body.condition is not None:
        data["condition"] = dump_condition(body.condition)
    for key, value in data.items():
        if key == "condition" and value is None:
            continue
        setattr(rule, key, value)
    await db.commit()
    await db.refresh(rule)
    await bump_version(user.id)
    return rule


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(rule_id: UUID, user: CurrentUser, db: DB) -> None:
    await db.delete(await _get(db, user.id, rule_id))
    await db.commit()
    await bump_version(user.id)


@router.put("/order", response_model=list[RuleOut])
async def reorder(body: RuleOrder, user: CurrentUser, db: DB) -> list[Rule]:
    rules = {r.id: r for r in (await db.scalars(select(Rule).where(Rule.user_id == user.id))).all()}
    if set(body.ids) != set(rules):
        raise AppError("Send every rule id exactly once", code="invalid_order", status=422)
    for position, rule_id in enumerate(body.ids):
        rules[rule_id].position = position
    await db.commit()
    await bump_version(user.id)
    return [rules[i] for i in body.ids]


def _sample_envelope(sample, mailbox_id: UUID) -> Envelope:
    headers = {k.lower(): [v] for k, v in sample.headers.items()}
    return Envelope(
        mailbox_id=mailbox_id, provider_message_id="sample", received_at=datetime.now(UTC),
        from_address=sample.from_address.lower(), from_name=sample.from_name, to=sample.to,
        subject=sample.subject, body_text=sample.body, snippet=sample.body[:200], headers=headers,
        attachments=[Attachment(name=n, mime_type="application/octet-stream") for n in sample.attachment_names],
    )


def _to_json(env: Envelope) -> dict:
    data = dataclasses.asdict(env)
    data["mailbox_id"] = str(env.mailbox_id)
    data["received_at"] = env.received_at.isoformat()
    return data


def _from_json(data: dict) -> Envelope:
    data = dict(data)
    data["mailbox_id"] = UUID(data["mailbox_id"])
    data["received_at"] = datetime.fromisoformat(data["received_at"])
    data["attachments"] = [Attachment(**a) for a in data.get("attachments", [])]
    return Envelope(**data)


async def _recent_envelopes(mailbox: Mailbox, limit: int) -> list[Envelope]:
    """Recent mail (full content) for previews, cached briefly so editing a rule doesn't hammer the API."""
    redis = get_redis()
    key = Keys.preview(mailbox.id)
    if cached := await redis.get(key):
        envs = [_from_json(e) for e in json.loads(cached)]
        if len(envs) >= limit:
            return envs[:limit]
    creds = vault().decrypt_json(mailbox.credentials)
    async with get_provider(mailbox.provider).open(mailbox.id, mailbox.address, creds) as session:
        refs = await session.recent(limit)
        if mailbox.provider.value == "gmail":
            sem = asyncio.Semaphore(5)

            async def load(ref: str) -> Envelope | None:
                async with sem:
                    return await session.load(ref, full=True)

            loaded = await asyncio.gather(*(load(r) for r in refs))
        else:
            loaded = [await session.load(r, full=True) for r in refs]
    envs = [e for e in loaded if e is not None]
    envs.sort(key=lambda e: e.received_at, reverse=True)
    await redis.set(key, json.dumps([_to_json(e) for e in envs]), ex=PREVIEW_TTL_S)
    return envs


@router.post("/test", response_model=RuleTestOut)
async def test_rule(body: RuleTest, user: CurrentUser, db: DB) -> RuleTestOut:
    """Dry-run a condition against a sample email or against recent mail in one of your mailboxes."""
    matcher = compile_condition(body.condition)
    envelopes: list[Envelope] = []
    if body.sample:
        envelopes.append(_sample_envelope(body.sample, body.mailbox_id or uuid7()))
    if body.mailbox_id:
        mailbox = await db.get(Mailbox, body.mailbox_id)
        if mailbox is None or mailbox.user_id != user.id:
            raise NotFound("Mailbox not found")
        try:
            envelopes += await _recent_envelopes(mailbox, body.limit)
        except ProviderError as exc:
            raise UpstreamError(f"Could not read recent mail: {exc}") from exc
    if not envelopes:
        raise AppError("Provide a sample email or a mailbox to test against", code="nothing_to_test", status=422)
    results = [
        RuleTestHit(matched=matcher(e), subject=e.subject, from_address=e.from_address, from_name=e.from_name,
                    received_at=None if e.provider_message_id == "sample" else e.received_at,
                    snippet=e.snippet[:200])
        for e in envelopes
    ]
    return RuleTestOut(tested=len(results), matched=sum(r.matched for r in results), results=results)
