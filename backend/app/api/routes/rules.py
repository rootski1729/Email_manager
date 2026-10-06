import asyncio
import dataclasses
import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser
from app.api.schemas import (
    FieldInfo,
    InstallPack,
    PackSuggestion,
    RuleCreate,
    RuleOrder,
    RuleOut,
    RulePackOut,
    RuleTest,
    RuleTestHit,
    RuleTestOut,
    RuleUpdate,
    SenderRuleCreate,
    SenderSuggestionOut,
    SuggestionsOut,
    dump_condition,
)
from app.core.config import PLANS
from app.core.db import uuid7
from app.core.errors import AppError, Conflict, LimitReached, NotFound, UpstreamError
from app.core.redis import Keys, get_redis
from app.core.security import vault
from app.models import Destination, Mailbox, Rule
from app.providers import get_provider
from app.providers.base import ProviderError
from app.rules.engine import compile_condition
from app.rules.envelope import Attachment, Envelope
from app.rules.packs import PACKS, PACKS_BY_ID, Pack, pack_hits, personal_senders, sender_rule
from app.rules.schema import FULL_MESSAGE_FIELDS, Actions, NotifyAction, Op
from app.services.rulesets import bump_version, load_ruleset

router = APIRouter(prefix="/rules", tags=["rules"])
PREVIEW_TTL_S = 300
SUGGEST_TTL_S = 600
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


async def _new_rule(
    db: DB, user: CurrentUser, *, name: str, condition: dict, source: str, urgent: bool = False,
    mailbox_ids: list[UUID] | None = None, description: str | None = None,
) -> Rule:
    count = await db.scalar(select(func.count()).select_from(Rule).where(Rule.user_id == user.id)) or 0
    limit = PLANS.get(user.plan, PLANS["free"]).rules
    if count >= limit:
        raise LimitReached(f"Your plan allows {limit} rules")
    await _check_refs(db, user.id, mailbox_ids, [])
    position = (await db.scalar(select(func.max(Rule.position)).where(Rule.user_id == user.id)) or 0) + 1
    rule = Rule(id=uuid7(), user_id=user.id, position=position, name=name[:120], description=description,
                enabled=True, stop_processing=False, mailbox_ids=mailbox_ids, condition=condition, source=source,
                actions=Actions(notify=NotifyAction(urgent=urgent)).model_dump(mode="json"))
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    await bump_version(user.id)
    return rule


async def _installed(db: DB, user_id: UUID) -> set[str]:
    sources = (await db.scalars(select(Rule.source).where(Rule.user_id == user_id, Rule.source.is_not(None)))).all()
    return {str(s) for s in sources}


def _pack_out(pack: Pack, installed: set[str]) -> RulePackOut:
    return RulePackOut(id=pack.id, name=pack.name, description=pack.description, icon=pack.icon, urgent=pack.urgent,
                       condition=pack.condition, installed=f"pack:{pack.id}" in installed)


@router.get("/packs", response_model=list[RulePackOut])
async def list_packs(user: CurrentUser, db: DB) -> list[RulePackOut]:
    """Ready-made rules for common important email: exams, interviews, bank alerts, deliveries..."""
    installed = await _installed(db, user.id)
    return [_pack_out(p, installed) for p in PACKS]


@router.post("/packs/{pack_id}/install", response_model=RuleOut, status_code=201)
async def install_pack(pack_id: str, user: CurrentUser, db: DB, body: InstallPack | None = None) -> Rule:
    pack = PACKS_BY_ID.get(pack_id)
    if pack is None:
        raise NotFound("Unknown starter pack")
    if f"pack:{pack.id}" in await _installed(db, user.id):
        raise Conflict(f"You already have the '{pack.name}' rule")
    return await _new_rule(db, user, name=pack.name, condition=pack.condition, source=f"pack:{pack.id}",
                           urgent=pack.urgent, mailbox_ids=body.mailbox_ids if body else None,
                           description=pack.description)


@router.post("/from-sender", response_model=RuleOut, status_code=201)
async def rule_from_sender(body: SenderRuleCreate, user: CurrentUser, db: DB) -> Rule:
    """One-tap rule from a suggestion: everything from this domain and its subdomains."""
    domain = body.domain.strip().lower().lstrip("@.")
    if "." not in domain or " " in domain:
        raise AppError("Enter a domain like univ.edu", code="invalid_domain", status=422)
    if f"sender:{domain}" in await _installed(db, user.id):
        raise Conflict(f"You already watch {domain}")
    return await _new_rule(db, user, name=body.name or f"Everything from {domain}", condition=sender_rule(domain),
                           source=f"sender:{domain}", urgent=body.urgent)


async def _recent_headers(mailbox: Mailbox, limit: int) -> list[Envelope]:
    """Headers (and Gmail snippets) of recent mail, cached for 10 minutes. Nothing is stored in the database."""
    redis = get_redis()
    key = Keys.suggestions(mailbox.id)
    if cached := await redis.get(key):
        return [_from_json(e) for e in json.loads(cached)]
    creds = vault().decrypt_json(mailbox.credentials)
    async with get_provider(mailbox.provider).open(mailbox.id, mailbox.address, creds) as session:
        refs = await session.recent(limit)
        if mailbox.provider.value == "gmail":
            sem = asyncio.Semaphore(8)

            async def load(ref: str) -> Envelope | None:
                async with sem:
                    return await session.load(ref, full=False)

            loaded = await asyncio.gather(*(load(r) for r in refs))
        else:
            loaded = [await session.load(r, full=False) for r in refs]
    envs = [e for e in loaded if e is not None]
    await redis.set(key, json.dumps([_to_json(e) for e in envs]), ex=SUGGEST_TTL_S)
    return envs


@router.get("/suggestions", response_model=SuggestionsOut)
async def suggestions(
    mailbox_id: UUID, user: CurrentUser, db: DB, limit: int = Query(80, ge=10, le=150),
) -> SuggestionsOut:
    """Look at recent mail and suggest rules: packs that would have caught something, and senders who write
    to you personally (a college, an employer)."""
    mailbox = await db.get(Mailbox, mailbox_id)
    if mailbox is None or mailbox.user_id != user.id:
        raise NotFound("Mailbox not found")
    try:
        envelopes = await _recent_headers(mailbox, limit)
    except ProviderError as exc:
        raise UpstreamError(f"Could not read recent mail: {exc}") from exc
    installed = await _installed(db, user.id)
    # Senders your rules already catch don't need a suggestion.
    ruleset = await load_ruleset(db, user.id)
    uncovered = [e for e in envelopes if not ruleset.evaluate(e)]
    packs = [PackSuggestion(pack=_pack_out(h.pack, installed), count=h.count, examples=h.examples)
             for h in pack_hits(envelopes) if f"pack:{h.pack.id}" not in installed]
    senders = [SenderSuggestionOut(domain=s.domain, count=s.count, examples=s.examples, names=s.names)
               for s in personal_senders(uncovered) if f"sender:{s.domain}" not in installed]
    return SuggestionsOut(mailbox_id=mailbox.id, scanned=len(envelopes), packs=packs, senders=senders)


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
    data.pop("calendars", None)
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
