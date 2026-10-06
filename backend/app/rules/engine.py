"""Compile rule conditions into fast predicates and evaluate them against envelopes."""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from uuid import UUID

import re2

from app.rules.envelope import Envelope, domain_of
from app.rules.schema import (
    FULL_MESSAGE_FIELDS,
    AllOf,
    AnyOf,
    Condition,
    ConditionDoc,
    NotOf,
    Op,
    Predicate,
    fields_used,
)

Matcher = Callable[[Envelope], bool]


@lru_cache(maxsize=2048)
def _regex(pattern: str, case_sensitive: bool) -> Any:
    options = re2.Options()
    options.case_sensitive = case_sensitive
    options.max_mem = 8 << 20
    return re2.compile(pattern, options)


def field_values(env: Envelope, name: str) -> list[str]:
    match name:
        case "from.address":
            return [env.from_address]
        case "from.name":
            return [env.from_name]
        case "from.domain":
            return [env.from_domain]
        case "to":
            return env.to
        case "cc":
            return env.cc
        case "reply_to":
            return env.reply_to
        case "recipients":
            return [*env.to, *env.cc]
        case "subject":
            return [env.subject]
        case "body":
            return [env.body_text or env.snippet]
        case "anywhere":
            return [env.from_name, env.from_address, env.subject, env.body_text or env.snippet,
                    *(a.name for a in env.attachments)]
        case "list_id":
            return [env.list_id] if env.list_id else []
        case "attachment.name":
            return [a.name for a in env.attachments]
        case "attachment.type":
            return [a.mime_type for a in env.attachments]
        case "mailbox":
            return [str(env.mailbox_id)]
        case _ if name.startswith("header:"):
            return env.header(name.removeprefix("header:"))
    return []


def _text_test(op: Op, needles: list[str], case_sensitive: bool) -> Callable[[str], bool]:
    if not case_sensitive:
        needles = [n.casefold() for n in needles]
    norm: Callable[[str], str] = (lambda s: s) if case_sensitive else str.casefold
    match op:
        case Op.equals:
            return lambda s: norm(s.strip()) in needles
        case Op.contains:
            return lambda s: any(n in norm(s) for n in needles)
        case Op.contains_all:
            return lambda s: all(n in norm(s) for n in needles)
        case Op.starts_with:
            return lambda s: norm(s).startswith(tuple(needles))
        case Op.ends_with:
            return lambda s: norm(s).endswith(tuple(needles))
        case Op.domain_matches:
            def test(s: str) -> bool:
                domain = s.lower() if "@" not in s else domain_of(s)
                return any(domain == d or domain.endswith("." + d) for d in needles)
            return test
    raise ValueError(f"unsupported text op {op}")


def compile_condition(cond: Condition) -> Matcher:
    if isinstance(cond, AllOf):
        parts = [compile_condition(c) for c in cond.all]
        return lambda env: all(p(env) for p in parts)
    if isinstance(cond, AnyOf):
        parts = [compile_condition(c) for c in cond.any]
        return lambda env: any(p(env) for p in parts)
    if isinstance(cond, NotOf):
        inner = compile_condition(cond.not_)
        return lambda env: not inner(env)
    return _compile_predicate(cond)


def _compile_predicate(p: Predicate) -> Matcher:
    name = p.field
    if p.op == Op.is_:
        expected = bool(p.value)
        return lambda env: bool(env.attachments) is expected
    if p.op == Op.exists:
        return lambda env: any(v for v in field_values(env, name))
    if p.op == Op.regex:
        rx = _regex(str(p.value), p.case_sensitive)
        return lambda env: any(rx.search(v) for v in field_values(env, name) if v)
    needles = p.value if isinstance(p.value, list) else [str(p.value)]
    test = _text_test(p.op, needles, p.case_sensitive)
    return lambda env: any(test(v) for v in field_values(env, name) if v)


def parse_condition(raw: dict[str, Any]) -> Condition:
    return ConditionDoc.model_validate({"root": raw}).root


@dataclass(slots=True)
class CompiledRule:
    id: UUID
    name: str
    position: int
    stop_processing: bool
    mailbox_ids: frozenset[UUID] | None
    needs_full: bool
    matcher: Matcher
    actions: dict[str, Any]

    def applies_to(self, mailbox_id: UUID) -> bool:
        return self.mailbox_ids is None or mailbox_id in self.mailbox_ids


class RuleSet:
    def __init__(self, rules: Iterable[CompiledRule]) -> None:
        self.rules = sorted(rules, key=lambda r: r.position)

    def needs_full(self, mailbox_id: UUID) -> bool:
        return any(r.needs_full for r in self.rules if r.applies_to(mailbox_id))

    def evaluate(self, env: Envelope) -> list[CompiledRule]:
        matched: list[CompiledRule] = []
        for rule in self.rules:
            if not rule.applies_to(env.mailbox_id):
                continue
            if rule.matcher(env):
                matched.append(rule)
                if rule.stop_processing:
                    break
        return matched

    def __len__(self) -> int:
        return len(self.rules)


def compile_rule(
    *, id: UUID, name: str, position: int, stop_processing: bool, mailbox_ids: list[UUID] | None,
    condition: dict[str, Any], actions: dict[str, Any],
) -> CompiledRule:
    cond = parse_condition(condition)
    return CompiledRule(
        id=id, name=name, position=position, stop_processing=stop_processing,
        mailbox_ids=frozenset(mailbox_ids) if mailbox_ids else None,
        needs_full=bool(fields_used(cond) & FULL_MESSAGE_FIELDS),
        matcher=compile_condition(cond), actions=actions,
    )
