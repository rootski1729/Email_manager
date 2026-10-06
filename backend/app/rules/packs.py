"""Ready-made rules ("starter packs") and inbox-based suggestions. Pure, no I/O."""

from collections import Counter
from dataclasses import dataclass
from typing import Any

from app.rules.engine import compile_condition, parse_condition
from app.rules.envelope import Envelope

NOT_NEWSLETTER = {"not": {"field": "header:List-Unsubscribe", "op": "exists"}}


def _subject_or_body(words: list[str]) -> dict[str, Any]:
    return {"any": [{"field": "subject", "op": "contains", "value": words},
                    {"field": "body", "op": "contains", "value": words}]}


@dataclass(frozen=True, slots=True)
class Pack:
    id: str
    name: str
    description: str
    icon: str  # lucide icon name for the UI
    condition: dict[str, Any]
    urgent: bool = False


PACKS: list[Pack] = [
    Pack("exams", "Exams & results", "Admit cards, hall tickets, date sheets, results and re-exams.", "graduation-cap",
         {"all": [_subject_or_body(["admit card", "hall ticket", "date sheet", "exam schedule", "examination",
                                    "result declared", "results declared", "re-exam", "answer key", "mid-sem",
                                    "end-sem", "viva", "practical exam"]), NOT_NEWSLETTER]}, urgent=True),
    Pack("jobs", "Jobs & interviews", "Interview invites, shortlists, assessments and offer letters.", "briefcase",
         {"all": [{"field": "subject", "op": "contains",
                   "value": ["interview", "shortlisted", "offer letter", "assessment", "next round",
                             "application status", "coding round", "onboarding", "your application"]},
                  NOT_NEWSLETTER]}, urgent=True),
    Pack("bank", "Bank & payments", "Debits, credits, failed payments, statements and EMI reminders.", "landmark",
         {"all": [{"field": "subject", "op": "contains",
                   "value": ["debited", "credited", "transaction alert", "payment failed", "payment received",
                             "statement", "emi", "credit card", "upi", "refund"]}, NOT_NEWSLETTER]}),
    Pack("bills", "Bills & due dates", "Invoices, renewals and anything with a due date.", "receipt",
         {"all": [{"field": "subject", "op": "contains",
                   "value": ["bill", "invoice", "due date", "overdue", "renewal", "payment reminder", "premium due",
                             "fee"]}, NOT_NEWSLETTER]}),
    Pack("security", "Account security", "New sign-ins, password changes and suspicious activity.", "shield-alert",
         {"field": "subject", "op": "contains",
          "value": ["new sign-in", "new login", "password changed", "password reset", "security alert",
                    "suspicious", "unusual activity", "new device", "2-step verification"]}, urgent=True),
    Pack("deliveries", "Orders & deliveries", "Shipped, out for delivery and delivered updates.", "package",
         {"field": "subject", "op": "contains",
          "value": ["out for delivery", "delivered", "shipped", "dispatched", "order confirmed", "arriving today"]}),
    Pack("travel", "Travel", "E-tickets, boarding passes, PNR updates and itineraries.", "plane",
         {"field": "subject", "op": "contains",
          "value": ["e-ticket", "boarding pass", "pnr", "booking confirmed", "itinerary", "web check-in",
                    "flight", "train ticket", "cancelled"]}),
    Pack("documents", "Government & documents", "Aadhaar, PAN, passport, income tax, EPFO and DigiLocker.",
         "file-badge",
         {"field": "anywhere", "op": "contains",
          "value": ["aadhaar", "pan card", "passport", "income tax", "itr", "epfo", "digilocker", "visa",
                    "driving licence"]}),
]
PACKS_BY_ID = {p.id: p for p in PACKS}

# Fail at import time, not in production, if a pack is malformed.
_COMPILED = {p.id: compile_condition(parse_condition(p.condition)) for p in PACKS}

FREEMAIL = {"gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "live.com",
            "icloud.com", "me.com", "proton.me", "protonmail.com", "rediffmail.com", "aol.com", "zoho.com"}
NOREPLY = ("noreply", "no-reply", "donotreply", "do-not-reply", "notifications", "newsletter", "marketing",
           "mailer", "news", "promo", "offers")


@dataclass(frozen=True, slots=True)
class PackHit:
    pack: Pack
    count: int
    examples: list[str]


@dataclass(frozen=True, slots=True)
class SenderSuggestion:
    domain: str
    count: int
    examples: list[str]
    names: list[str]


def pack_hits(envelopes: list[Envelope]) -> list[PackHit]:
    """How many recent emails each pack would have caught: the most convincing way to suggest one."""
    hits: list[PackHit] = []
    for pack in PACKS:
        matcher = _COMPILED[pack.id]
        matched = [e for e in envelopes if matcher(e)]
        if matched:
            hits.append(PackHit(pack, len(matched), [e.subject[:100] for e in matched[:3]]))
    hits.sort(key=lambda h: -h.count)
    return hits


def personal_senders(envelopes: list[Envelope], *, min_count: int = 2, limit: int = 5) -> list[SenderSuggestion]:
    """Organisations that write to you directly (no newsletter headers): a college, an employer, a landlord."""
    counts: Counter[str] = Counter()
    examples: dict[str, list[str]] = {}
    names: dict[str, Counter[str]] = {}
    for e in envelopes:
        domain = e.from_domain
        local = e.from_address.split("@", 1)[0].lower()
        if not domain or domain in FREEMAIL or e.header("list-unsubscribe") or e.list_id:
            continue
        if any(word in local for word in NOREPLY):
            continue
        # Group subdomains under the registrable part (exam.univ.edu -> univ.edu), keeping 2-part ccTLDs.
        parts = domain.split(".")
        base = ".".join(parts[-3:]) if len(parts) > 2 and len(parts[-2]) <= 3 and len(parts[-1]) == 2 \
            else ".".join(parts[-2:])
        counts[base] += 1
        examples.setdefault(base, []).append(e.subject[:100])
        names.setdefault(base, Counter())[e.from_name or e.from_address] += 1
    return [
        SenderSuggestion(domain, n, examples[domain][:3], [name for name, _ in names[domain].most_common(3)])
        for domain, n in counts.most_common(limit) if n >= min_count
    ]


def sender_rule(domain: str) -> dict[str, Any]:
    return {"field": "from.domain", "op": "domain_matches", "value": domain}
