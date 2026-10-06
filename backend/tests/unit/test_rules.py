from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.rules.engine import RuleSet, compile_rule, parse_condition
from app.rules.envelope import Attachment, Envelope

MAILBOX = uuid4()


def env(**kw) -> Envelope:
    base = dict(
        mailbox_id=MAILBOX, provider_message_id="m1", received_at=datetime.now(UTC),
        from_address="alerts@exam.univ.edu", from_name="Exam Cell", subject="Mid-sem schedule released",
        to=["me@gmail.com"], headers={"list-id": ["<notices.univ.edu>"], "x-priority": ["1"]},
    )
    base.update(kw)
    return Envelope(**base)


def matches(condition: dict, e: Envelope | None = None) -> bool:
    rule = compile_rule(id=uuid4(), name="r", position=0, stop_processing=False, mailbox_ids=None,
                        condition=condition, actions={})
    return rule.matcher(e or env())


@pytest.mark.parametrize(
    ("value", "expected"),
    [("univ.edu", True), ("exam.univ.edu", True), ("*.univ.edu", True), ("@univ.edu", True),
     ("niv.edu", False), ("other.edu", False)],
)
def test_domain_matches_subdomains_but_not_suffix_strings(value, expected):
    assert matches({"field": "from.domain", "op": "domain_matches", "value": value}) is expected


def test_domain_matches_on_address_fields():
    assert matches({"field": "to", "op": "domain_matches", "value": "gmail.com"})
    assert not matches({"field": "from.address", "op": "domain_matches", "value": "notuniv.edu"})


def test_text_ops_are_case_insensitive_by_default():
    assert matches({"field": "subject", "op": "contains", "value": "MID-SEM"})
    assert not matches({"field": "subject", "op": "contains", "value": "MID-SEM", "case_sensitive": True})
    assert matches({"field": "subject", "op": "starts_with", "value": "mid"})
    assert matches({"field": "subject", "op": "ends_with", "value": ["nope", "released"]})
    assert matches({"field": "from.name", "op": "equals", "value": "exam cell"})
    assert matches({"field": "subject", "op": "contains_all", "value": ["mid", "schedule"]})
    assert not matches({"field": "subject", "op": "contains_all", "value": ["mid", "result"]})


def test_list_value_means_any_of():
    assert matches({"field": "subject", "op": "contains", "value": ["admit card", "schedule"]})


def test_headers_and_exists():
    assert matches({"field": "header:X-Priority", "op": "equals", "value": "1"})
    assert matches({"field": "header:list-id", "op": "contains", "value": "notices"})
    assert matches({"field": "list_id", "op": "exists"})
    assert not matches({"field": "header:List-Unsubscribe", "op": "exists"})


def test_regex_uses_re2_and_honours_case():
    cond = {"field": "subject", "op": "regex", "value": r"\b(mid|end)[- ]?sem\b"}
    assert matches(cond)
    assert matches({**cond, "value": r"MID"})
    assert not matches({**cond, "value": r"MID", "case_sensitive": True})


def test_boolean_tree():
    cond = {
        "all": [
            {"field": "from.domain", "op": "domain_matches", "value": "univ.edu"},
            {"any": [
                {"field": "subject", "op": "contains", "value": ["admit card"]},
                {"field": "body", "op": "regex", "value": "hall ticket"},
            ]},
            {"not": {"field": "header:List-Unsubscribe", "op": "exists"}},
        ]
    }
    assert not matches(cond)
    assert matches(cond, env(body_text="Download your HALL TICKET today"))
    assert not matches(cond, env(body_text="hall ticket", headers={"list-unsubscribe": ["<x>"]}))


def test_body_falls_back_to_snippet_and_anywhere():
    assert matches({"field": "body", "op": "contains", "value": "venue"}, env(snippet="Exam venue changed"))
    assert matches({"field": "anywhere", "op": "contains", "value": "exam cell"})


def test_attachments():
    e = env(attachments=[Attachment(name="AdmitCard.pdf", mime_type="application/pdf")])
    assert matches({"field": "has_attachment", "op": "is", "value": True}, e)
    assert not matches({"field": "has_attachment", "op": "is", "value": True})
    assert matches({"field": "attachment.name", "op": "ends_with", "value": ".pdf"}, e)


@pytest.mark.parametrize(
    "bad",
    [
        {"field": "nonsense", "op": "contains", "value": "x"},
        {"field": "subject", "op": "regex", "value": "("},
        {"field": "subject", "op": "contains", "value": []},
        {"field": "subject", "op": "contains", "value": ["  "]},
        {"field": "subject", "op": "exists", "value": "x"},
        {"field": "subject", "op": "domain_matches", "value": "a.com"},
        {"field": "has_attachment", "op": "contains", "value": "x"},
        {"field": "subject", "op": "contains", "value": "x", "extra": 1},
        {"all": []},
    ],
)
def test_invalid_conditions_are_rejected(bad):
    with pytest.raises(ValidationError):
        parse_condition(bad)


def test_size_limits():
    deep: dict = {"field": "subject", "op": "contains", "value": "x"}
    for _ in range(7):
        deep = {"not": deep}
    with pytest.raises(ValidationError, match="nested"):
        parse_condition(deep)
    wide = {"any": [{"field": "subject", "op": "contains", "value": str(i)} for i in range(70)]}
    with pytest.raises(ValidationError, match="at most"):
        parse_condition(wide)


def test_ruleset_order_stop_processing_mailbox_scope_and_needs_full():
    other_mailbox = uuid4()
    mk = lambda name, pos, cond, **kw: compile_rule(  # noqa: E731
        id=uuid4(), name=name, position=pos, stop_processing=kw.get("stop", False),
        mailbox_ids=kw.get("mailboxes"), condition=cond, actions={})
    subject = {"field": "subject", "op": "contains", "value": "sem"}
    body = {"field": "body", "op": "contains", "value": "sem"}
    rs = RuleSet([
        mk("third", 3, subject),
        mk("first", 1, subject),
        mk("scoped", 2, subject, mailboxes=[other_mailbox]),
        mk("stopper", 4, subject, stop=True),
        mk("after-stop", 5, body),
    ])
    assert [r.name for r in rs.evaluate(env())] == ["first", "third", "stopper"]
    assert rs.needs_full(MAILBOX)
    assert not RuleSet([mk("a", 0, subject)]).needs_full(MAILBOX)


def test_condition_round_trips_with_not_alias():
    cond = parse_condition({"not": {"field": "subject", "op": "contains", "value": "x"}})
    assert cond.model_dump(exclude_none=True) == {"not": {"field": "subject", "op": "contains",
                                                         "value": "x", "case_sensitive": False}}
