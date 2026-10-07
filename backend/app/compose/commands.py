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
    open = "open"  # /open K7: full text of an alerted email
    thread = "thread"  # /thread K7: the earlier messages of a reply
    files = "files"  # /files K7 [n]: send the email's attachments as WhatsApp documents
    reply = "reply"  # /reply K7: reply form addressed to the sender
    remind = "remind"  # /remind K7 tomorrow 9am
    mute = "mute"  # /mute K7 [domain] | /mute someone@x.com | /mute x.com
    unmute = "unmute"
    muted = "muted"  # list muted senders
    recent = "recent"  # last alerts with their codes
    upcoming = "upcoming"  # dates found in your important email
    write = "write"  # /write email prof@x.edu asking for leave  (AI drafts a new email)
    edit = "edit"  # /edit make it shorter  (AI revises the draft waiting for YES)
    ask = "ask"  # /ask when is my exam?  (AI answers from your important mail)
    ideas = "ideas"  # /ideas K7 [what you want]: AI reply suggestions, optionally steered by your own words
    pick = "pick"  # "2" or "2 mention I'm travelling": choose a suggested reply (and add to it)
    unknown_command = "unknown_command"  # any other /word
    text = "text"  # ordinary message


@dataclass(frozen=True, slots=True)
class Command:
    kind: Kind
    arg: str = ""
    raw: str = ""


REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_REF_IN_ALERT = re.compile(r"#([2-9A-HJKMNP-Z]{2,6})\b")
_REF_ARG = re.compile(r"^#?([2-9a-hjkmnp-z]{2,6})$", re.I)
# Words that act on a quoted alert, with or without the slash: "remind 2h", "open", "mute".
QUOTE_ACTIONS = {"open": "/open", "full": "/open", "read": "/open", "show": "/open", "reply": "/reply",
                 "remind": "/remind", "snooze": "/remind", "mute": "/mute", "thread": "/thread",
                 "files": "/files", "attachments": "/files", "ideas": "/ideas", "suggest": "/ideas"}
_PICK = re.compile(r"^([1-5])(?:\s*[.:)\-]?\s+(\S.*))?$", re.S)


def encode_ref(n: int) -> str:
    """1 -> '32' ... at least two characters, no look-alikes (0/O, 1/I/L)."""
    n += len(REF_ALPHABET) - 1
    out = ""
    while n:
        n, r = divmod(n, len(REF_ALPHABET))
        out = REF_ALPHABET[r] + out
    return out


def normalize_ref(token: str) -> str | None:
    match = _REF_ARG.match(token.strip())
    return match.group(1).upper() if match else None


def refs_in(text: str | None) -> list[str]:
    return list(dict.fromkeys(_REF_IN_ALERT.findall(text or "")))


def parse_command(text: str | None, *, quoted: str | None = None) -> Command:
    raw = (text or "").strip()
    if not raw:
        return Command(Kind.text, raw=raw)
    # Replying to (quoting) one of our alerts: "remind 2h" -> "/remind K7 2h".
    quoted_refs = refs_in(quoted)
    if len(quoted_refs) == 1:
        word, _, rest = raw.partition(" ")
        action = QUOTE_ACTIONS.get(word.lower().lstrip("/"))
        first = rest.split(" ", 1)[0] if rest else ""
        # "remind 2h": 2h looks like a code too, so the quoted alert wins unless a code is typed as "#AB".
        explicit = first.startswith("#") and normalize_ref(first) is not None
        if action and (explicit or normalize_ref(first) == quoted_refs[0]):
            raw = f"{action} {rest}".strip()
        elif action:
            raw = f"{action} {quoted_refs[0]} {rest}".strip()
    first_line = raw.splitlines()[0].strip()
    lowered = first_line.lower()
    if lowered.startswith("/send"):
        return Command(Kind.send, raw=raw)
    if pick := _PICK.match(raw):
        return Command(Kind.pick, arg=" ".join(filter(None, pick.groups())), raw=raw)
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
        case "/open" | "/full" | "/read" | "/show":
            return Command(Kind.open, arg=rest.strip(), raw=raw)
        case "/thread" | "/history" | "/earlier":
            return Command(Kind.thread, arg=rest.strip(), raw=raw)
        case "/files" | "/file" | "/attachments" | "/attachment":
            return Command(Kind.files, arg=rest.strip(), raw=raw)
        case "/ideas" | "/suggest" | "/suggestions":
            return Command(Kind.ideas, arg=raw.partition(" ")[2].strip(), raw=raw)
        case "/reply" | "/re":
            return Command(Kind.reply, arg=rest.strip(), raw=raw)
        case "/remind" | "/snooze" | "/remindme":
            return Command(Kind.remind, arg=rest.strip(), raw=raw)
        case "/mute":
            return Command(Kind.mute, arg=rest.strip(), raw=raw)
        case "/unmute":
            return Command(Kind.unmute, arg=rest.strip(), raw=raw)
        case "/muted":
            return Command(Kind.muted, raw=raw)
        case "/recent" | "/latest" | "/last":
            return Command(Kind.recent, raw=raw)
        case "/upcoming" | "/deadlines" | "/agenda" | "/calendar":
            return Command(Kind.upcoming, raw=raw)
        case "/write" | "/draft":
            return Command(Kind.write, arg=raw.partition(" ")[2].strip(), raw=raw)
        case "/edit" | "/change" | "/rewrite":
            return Command(Kind.edit, arg=raw.partition(" ")[2].strip(), raw=raw)
        case "/ask" | "/find" | "/search":
            return Command(Kind.ask, arg=raw.partition(" ")[2].strip(), raw=raw)
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
    "🤖 *MailSentinel · what you can do*\n"
    "_Every alert has a code like *#K7*. Use it in a command, or swipe right on the alert and type just the word "
    "(open, reply, remind 2h…)._\n\n"
    "📖 *Read*\n"
    "- */open K7* · the full email\n"
    "- */thread K7* · earlier messages of a reply\n"
    "- */files K7* · get the attachments here (*/files K7 2* for one)\n"
    "- */recent* · your latest important emails\n"
    "- */upcoming* · exams, interviews and due dates\n\n"
    "✨ *Reply with AI*\n"
    "- */reply K7* · three reply ideas, answer *1*, *2* or *3*\n"
    "- *2 mention I'm travelling* · pick an idea and add to it\n"
    "- */ideas K7 politely decline* · ideas that follow your words\n"
    "- */reply K7 say I'll attend* · write the reply straight away\n"
    "- */reply K7 manual* · write it yourself\n\n"
    "✍️ *Write and send*\n"
    "- */write email prof@x.edu asking for leave tomorrow*\n"
    "- */edit make it shorter* · change the draft\n"
    "- *YES* sends it · *NO* cancels\n"
    "- */email leave* · a saved template · */templates* lists them\n\n"
    "⏰ *Stay on top*\n"
    "- */remind K7 2h* · also *6pm*, *tomorrow 9am*, *mon 8:30*\n"
    "- */mute K7* · no more alerts from this sender (*/mute K7 domain* for all of them)\n"
    "- */muted* · */unmute someone@x.com*\n\n"
    "💬 *Ask*\n"
    "- */ask when is my exam?* · answers from your important mail"
)
