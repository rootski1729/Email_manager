"""Parse WhatsApp commands and the copy-paste email form. Pure functions, no I/O.

The form the bot sends (and the user copies, edits and sends back):

    /send
    From: me@gmail.com
    To: prof@univ.edu, office@univ.edu
    Cc:
    Bcc:
    Subject: Leave application
    Body:
    Dear Sir,
    ...
"""

import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from email_validator import EmailNotValidError, validate_email

TEMPLATE_NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")
_HEADER = re.compile(r"^\s*[*_~]*\s*(from|to|cc|bcc|subject|body)\s*[*_~]*\s*:\s*[*_~]*\s?(.*)$", re.I)
_SPLIT = re.compile(r"[,;\s]+")
CONFIRM_WORDS = {"yes", "y", "send", "/yes", "/confirm", "confirm", "ok", "✅"}
CANCEL_WORDS = {"no", "n", "/no", "/cancel", "cancel", "stop", "❌"}


class Kind(StrEnum):
    email = "email"  # /email [template]
    templates = "templates"  # /templates
    send = "send"  # /send + form
    confirm = "confirm"  # YES
    cancel = "cancel"  # NO / /cancel
    help = "help"  # /help
    unknown_command = "unknown_command"  # any other /word
    text = "text"  # ordinary message


@dataclass(frozen=True, slots=True)
class Command:
    kind: Kind
    arg: str = ""
    raw: str = ""


def parse_command(text: str | None) -> Command:
    raw = (text or "").strip()
    if not raw:
        return Command(Kind.text, raw=raw)
    first_line = raw.splitlines()[0].strip()
    lowered = first_line.lower()
    if lowered.startswith("/send"):
        return Command(Kind.send, raw=raw)
    if raw.lower() in CONFIRM_WORDS:
        return Command(Kind.confirm, raw=raw)
    if raw.lower() in CANCEL_WORDS:
        return Command(Kind.cancel, raw=raw)
    if not lowered.startswith("/"):
        return Command(Kind.text, raw=raw)
    word, _, rest = first_line.partition(" ")
    match word.lower():
        case "/email" | "/mail" | "/compose":
            return Command(Kind.email, arg=rest.strip().lower(), raw=raw)
        case "/templates" | "/template":
            return Command(Kind.templates, raw=raw)
        case "/help" | "/start" | "/commands":
            return Command(Kind.help, raw=raw)
    return Command(Kind.unknown_command, arg=word, raw=raw)


@dataclass
class Draft:
    from_address: str | None = None
    to: list[str] = field(default_factory=list)
    cc: list[str] = field(default_factory=list)
    bcc: list[str] = field(default_factory=list)
    subject: str = ""
    body: str = ""
    errors: list[str] = field(default_factory=list)

    @property
    def recipients(self) -> list[str]:
        return [*self.to, *self.cc, *self.bcc]


def _addresses(value: str, label: str, errors: list[str]) -> list[str]:
    found: list[str] = []
    for token in _SPLIT.split(value.strip()):
        token = token.strip().strip("<>").removeprefix("mailto:")
        if not token:
            continue
        try:
            normalized = validate_email(token, check_deliverability=False).normalized
        except EmailNotValidError:
            errors.append(f"{label}: '{token}' is not a valid email address")
            continue
        if normalized.lower() not in (f.lower() for f in found):
            found.append(normalized)
    return found


def parse_draft(text: str, *, max_recipients: int) -> Draft:
    """Parse a `/send` form. Problems are collected in `draft.errors` (not raised) for a friendly reply."""
    draft = Draft()
    lines = text.strip().splitlines()
    if not lines or not lines[0].strip().lower().startswith("/send"):
        draft.errors.append("The form must start with /send")
        return draft
    body_lines: list[str] | None = None
    first = lines[0].strip()[len("/send"):].strip()
    rest = ([first] if first else []) + lines[1:]
    for line in rest:
        if body_lines is not None:
            body_lines.append(line)
            continue
        match = _HEADER.match(line)
        if not match:
            if line.strip():
                draft.errors.append(f"I don't understand the line '{line.strip()[:60]}'. "
                                    "Put the message text after 'Body:'")
            continue
        key, value = match.group(1).lower(), match.group(2).strip()
        match key:
            case "from":
                addresses = _addresses(value, "From", draft.errors) if value else []
                draft.from_address = addresses[0] if addresses else None
            case "to":
                draft.to += _addresses(value, "To", draft.errors)
            case "cc":
                draft.cc += _addresses(value, "Cc", draft.errors)
            case "bcc":
                draft.bcc += _addresses(value, "Bcc", draft.errors)
            case "subject":
                draft.subject = value
            case "body":
                body_lines = [value] if value else []
    draft.body = "\n".join(body_lines or []).strip("\n")
    if not draft.to:
        draft.errors.append("Add at least one address after 'To:'")
    if len(draft.recipients) > max_recipients:
        draft.errors.append(f"At most {max_recipients} recipients in total")
    if len(draft.subject) > 500:
        draft.errors.append("The subject is too long (500 characters max)")
    return draft


@dataclass(frozen=True, slots=True)
class TemplateValues:
    from_address: str
    to: list[str]
    cc: list[str]
    bcc: list[str]
    subject: str
    body: str


def fill_placeholders(text: str, *, now: datetime, name: str | None) -> str:
    replacements = {
        "date": now.strftime("%d %b %Y"),
        "time": now.strftime("%H:%M"),
        "name": name or "",
    }
    return re.sub(r"\{\{\s*(date|time|name)\s*\}\}", lambda m: replacements[m.group(1).lower()], text)


def render_form(values: TemplateValues) -> str:
    """The plain-text form the user long-presses, copies, edits and sends back."""
    return "\n".join([
        "/send",
        f"From: {values.from_address}",
        f"To: {', '.join(values.to)}",
        f"Cc: {', '.join(values.cc)}",
        f"Bcc: {', '.join(values.bcc)}",
        f"Subject: {values.subject}",
        "Body:",
        values.body or "Write your message here.",
    ])


def human_size(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.0f} KB"
    return f"{size / 1024 / 1024:.1f} MB"


INSTRUCTIONS = (
    "✉️ *Send an email from WhatsApp*\n\n"
    "1. Copy the next message (long-press → Copy).\n"
    "2. Fill in *To*, *Subject* and the text after *Body:*. Separate several addresses with commas.\n"
    "3. Want attachments? Send the photos or documents here first.\n"
    "4. Paste and send the form. I'll show a preview; reply *YES* to send or *NO* to cancel.\n\n"
    "_From_ must be one of your connected mailboxes that can send."
)

HELP = (
    "🤖 *MailSentinel commands*\n\n"
    "*/email* – get a blank email form\n"
    "*/email <template>* – get a saved template, e.g. /email leave\n"
    "*/templates* – list your templates\n"
    "*/send* … – send the filled form (you'll confirm first)\n"
    "*YES* / *NO* – confirm or cancel the email waiting for confirmation\n"
    "*/cancel* – cancel and drop any attachments you sent\n\n"
    "Manage templates in the web app under *Email templates*."
)
