"""Per-user compiled rule sets, cached in-process and invalidated through a Redis version counter."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import log
from app.core.redis import Keys, get_redis
from app.models import Rule
from app.rules.engine import CompiledRule, RuleSet, compile_rule

_cache: dict[UUID, tuple[str, RuleSet]] = {}


async def bump_version(user_id: UUID) -> None:
    await get_redis().incr(Keys.rules_version(user_id))


async def load_ruleset(db: AsyncSession, user_id: UUID) -> RuleSet:
    version = str(await get_redis().get(Keys.rules_version(user_id)) or "0")
    cached = _cache.get(user_id)
    if cached and cached[0] == version:
        return cached[1]
    rows = (await db.scalars(
        select(Rule).where(Rule.user_id == user_id, Rule.enabled.is_(True)).order_by(Rule.position)
    )).all()
    compiled: list[CompiledRule] = []
    for r in rows:
        try:
            compiled.append(compile_rule(
                id=r.id, name=r.name, position=r.position, stop_processing=r.stop_processing,
                mailbox_ids=r.mailbox_ids, condition=r.condition, actions=r.actions,
            ))
        except ValueError:
            log.warning("rule_compile_failed", rule_id=str(r.id))
    ruleset = RuleSet(compiled)
    _cache[user_id] = (version, ruleset)
    return ruleset
