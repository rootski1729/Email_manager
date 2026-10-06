"""Rule condition and action schema. Stored as JSONB, validated here on every write."""

from __future__ import annotations

import re
from enum import StrEnum
from typing import Annotated, Any, Literal
from uuid import UUID

import re2
from pydantic import BaseModel, ConfigDict, Discriminator, Field, Tag, field_validator, model_validator

MAX_DEPTH = 6
MAX_NODES = 60
MAX_LIST = 25
MAX_VALUE_LEN = 300
MAX_REGEX_LEN = 500

FIELD_PATTERN = re.compile(
    r"^(from\.address|from\.name|from\.domain|to|cc|reply_to|recipients|subject|body|anywhere|list_id"
    r"|attachment\.name|attachment\.type|has_attachment|mailbox|header:[A-Za-z0-9-]{1,64})$"
)
# Fields whose evaluation requires the full message, not only headers.
FULL_MESSAGE_FIELDS = {"body", "anywhere", "attachment.name", "attachment.type", "has_attachment"}
ADDRESS_FIELDS = {"from.address", "to", "cc", "reply_to", "recipients"}


class Op(StrEnum):
    equals = "equals"
    contains = "contains"
    contains_all = "contains_all"
    starts_with = "starts_with"
    ends_with = "ends_with"
    regex = "regex"
    exists = "exists"
    domain_matches = "domain_matches"
    is_ = "is"


TEXT_OPS = {Op.equals, Op.contains, Op.contains_all, Op.starts_with, Op.ends_with, Op.domain_matches}


class Predicate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: str = Field(description="e.g. subject, from.domain, header:List-Id, anywhere")
    op: Op
    value: str | list[str] | bool | None = None
    case_sensitive: bool = False

    @field_validator("field")
    @classmethod
    def _field(cls, v: str) -> str:
        if not FIELD_PATTERN.match(v):
            raise ValueError(f"unknown field '{v}'")
        return v

    @model_validator(mode="after")
    def _check(self) -> Predicate:
        op, value = self.op, self.value
        if op == Op.exists:
            if value is not None:
                raise ValueError("'exists' takes no value")
            return self
        if op == Op.is_:
            if self.field != "has_attachment" or not isinstance(value, bool):
                raise ValueError("'is' only applies to has_attachment with a true/false value")
            return self
        if self.field == "has_attachment":
            raise ValueError("has_attachment only supports the 'is' operator")
        if op == Op.domain_matches and self.field not in ADDRESS_FIELDS | {"from.domain"}:
            raise ValueError("'domain_matches' applies to address fields and from.domain")
        if op == Op.regex:
            if not isinstance(value, str) or not value:
                raise ValueError("'regex' needs a pattern")
            if len(value) > MAX_REGEX_LEN:
                raise ValueError(f"regex longer than {MAX_REGEX_LEN} characters")
            try:
                re2.compile(value)
            except re2.error as exc:
                raise ValueError(f"invalid regex: {exc}") from exc
            return self
        values = [value] if isinstance(value, str) else value
        if not isinstance(values, list) or not values:
            raise ValueError(f"'{op}' needs a text value or a list of values")
        values = [v.strip() for v in values if isinstance(v, str) and v.strip()]
        if not values:
            raise ValueError("values must not be empty")
        if len(values) > MAX_LIST:
            raise ValueError(f"at most {MAX_LIST} values per condition")
        if any(len(v) > MAX_VALUE_LEN for v in values):
            raise ValueError(f"values are limited to {MAX_VALUE_LEN} characters")
        if op == Op.domain_matches:
            values = [v.lower().lstrip("@").lstrip("*.").rstrip(".") for v in values]
        self.value = values if isinstance(value, list) else values[0]
        return self


class AllOf(BaseModel):
    model_config = ConfigDict(extra="forbid")
    all: list[Condition] = Field(min_length=1)


class AnyOf(BaseModel):
    model_config = ConfigDict(extra="forbid")
    any: list[Condition] = Field(min_length=1)


class NotOf(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, serialize_by_alias=True)
    not_: Condition = Field(alias="not")


def _kind(v: Any) -> str:
    if isinstance(v, dict):
        for key in ("all", "any", "not"):
            if key in v:
                return key
        return "predicate"
    return {AllOf: "all", AnyOf: "any", NotOf: "not"}.get(type(v), "predicate")


Condition = Annotated[
    Annotated[Predicate, Tag("predicate")]
    | Annotated[AllOf, Tag("all")]
    | Annotated[AnyOf, Tag("any")]
    | Annotated[NotOf, Tag("not")],
    Discriminator(_kind),
]

AllOf.model_rebuild()
AnyOf.model_rebuild()
NotOf.model_rebuild()


def measure(cond: Condition, depth: int = 1) -> tuple[int, int]:
    """Return (max depth, node count) of a condition tree."""
    if isinstance(cond, Predicate):
        return depth, 1
    children = cond.all if isinstance(cond, AllOf) else cond.any if isinstance(cond, AnyOf) else [cond.not_]
    max_depth, nodes = depth, 1
    for child in children:
        d, n = measure(child, depth + 1)
        max_depth, nodes = max(max_depth, d), nodes + n
    return max_depth, nodes


def fields_used(cond: Condition) -> set[str]:
    if isinstance(cond, Predicate):
        return {cond.field}
    children = cond.all if isinstance(cond, AllOf) else cond.any if isinstance(cond, AnyOf) else [cond.not_]
    return set().union(*(fields_used(c) for c in children))


class ConditionDoc(BaseModel):
    """Wrapper used for validating a whole tree, including size limits."""

    root: Condition

    @model_validator(mode="after")
    def _limits(self) -> ConditionDoc:
        depth, nodes = measure(self.root)
        if depth > MAX_DEPTH:
            raise ValueError(f"conditions can be nested at most {MAX_DEPTH} levels deep")
        if nodes > MAX_NODES:
            raise ValueError(f"a rule can have at most {MAX_NODES} conditions")
        return self


class NotifyAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Empty list means "the user's default destination".
    destinations: list[UUID] = Field(default_factory=list, max_length=10)
    mode: Literal["instant", "digest"] = "instant"


class Actions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notify: NotifyAction | None = Field(default_factory=NotifyAction)
