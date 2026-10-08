"""An email's HTML, made safe to show on the website the way a mail client would.

The website renders the result inside a sandboxed iframe with scripts disabled, but the HTML is also cleaned
here: only formatting tags and attributes survive (no scripts, forms, frames, event handlers or unsafe URLs),
CSS is limited to presentational properties, quoted history is removed from replies (the thread is shown
separately), inline (cid:) images are embedded, and remote images are held back until the reader asks for
them because they are often tracking pixels.
"""

import base64
import re
from dataclasses import dataclass
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser

import nh3
from lxml import html as lxml_html
from lxml.etree import ParserError

MAX_HTML_BYTES = 1_500_000
MAX_INLINE_IMAGE_BYTES = 400_000

TAGS = {
    "a", "abbr", "b", "big", "blockquote", "br", "caption", "center", "cite", "code", "col", "colgroup", "dd",
    "del", "div", "dl", "dt", "em", "font", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd",
    "li", "mark", "ol", "p", "pre", "q", "s", "small", "span", "strike", "strong", "sub", "sup", "table",
    "tbody", "td", "tfoot", "th", "thead", "tr", "tt", "u", "ul",
}
COMMON = {"style", "align", "valign", "dir", "title", "width", "height", "bgcolor", "color", "lang"}
ATTRIBUTES = {
    "*": COMMON,
    "a": {"href", "name"},
    "img": {"src", "alt", "border"},
    "table": {"border", "cellpadding", "cellspacing", "summary"},
    "td": {"colspan", "rowspan", "nowrap"},
    "th": {"colspan", "rowspan", "nowrap", "scope"},
    "col": {"span"},
    "colgroup": {"span"},
    "font": {"face", "size"},
    "ol": {"start", "type"},
    "ul": {"type"},
    "blockquote": {"cite"},
}
STYLE_PROPERTIES = {
    "background", "background-color", "border", "border-bottom", "border-collapse", "border-color",
    "border-left", "border-radius", "border-right", "border-spacing", "border-style", "border-top",
    "border-width", "color", "display", "font", "font-family", "font-size", "font-style", "font-weight",
    "height", "letter-spacing", "line-height", "list-style", "list-style-type", "margin", "margin-bottom",
    "margin-left", "margin-right", "margin-top", "max-width", "min-width", "padding", "padding-bottom",
    "padding-left", "padding-right", "padding-top", "text-align", "text-decoration", "text-indent",
    "text-transform", "vertical-align", "white-space", "width", "word-break", "word-wrap", "overflow-wrap",
}

# Quoted history inside a reply, by mail client.
_QUOTE_SELECTORS = [
    "//div[contains(concat(' ', normalize-space(@class), ' '), ' gmail_quote ')]",  # Gmail
    "//div[contains(@class, 'gmail_extra')]//blockquote",
    "//blockquote[@type='cite']",  # Apple Mail, Thunderbird
    "//div[contains(@class, 'yahoo_quoted')]",  # Yahoo
    "//div[contains(@class, 'moz-cite-prefix')]",  # Thunderbird's "On … wrote:" line
]
# Outlook puts everything after one of these markers.
_OUTLOOK_MARKERS = ["//div[@id='divRplyFwdMsg']", "//div[@id='appendonsend']", "//hr[@id='stopSpelling']",
                    "//div[@id='mail-editor-reference-message-container']"]
_CID_SRC = re.compile(r'src="cid:([^"]+)"', re.I)
_REMOTE_SRC = re.compile(r'<img([^>]*?)\ssrc="(https?://[^"]+)"', re.I)


@dataclass(frozen=True, slots=True)
class SafeHtml:
    html: str
    remote_images: int  # images held back as data-ms-src until the reader chooses to load them


def _html_part(msg: EmailMessage) -> str | None:
    part = msg.get_body(preferencelist=("html",))
    if part is None or part.get_content_type() != "text/html":
        return None
    try:
        content = part.get_content()
    except (LookupError, ValueError, AssertionError):
        payload = part.get_payload(decode=True) or b""
        content = payload.decode("utf-8", errors="replace") if isinstance(payload, bytes) else ""
    return content if isinstance(content, str) and content.strip() else None


def _inline_images(msg: EmailMessage) -> dict[str, str]:
    """Content-ID -> data: URI for small inline images (logos, signatures, screenshots pasted into the mail)."""
    found: dict[str, str] = {}
    for part in msg.walk():
        cid = (part.get("Content-ID") or "").strip().strip("<>")
        if not cid or not part.get_content_type().startswith("image/"):
            continue
        data = part.get_payload(decode=True)
        if isinstance(data, bytes) and 0 < len(data) <= MAX_INLINE_IMAGE_BYTES:
            found[cid.lower()] = f"data:{part.get_content_type()};base64,{base64.b64encode(data).decode()}"
    return found


def _drop_quoted_history(html: str) -> str:
    try:
        doc = lxml_html.document_fromstring(html)
    except (ParserError, ValueError):
        return html
    removed = False
    for xpath in _OUTLOOK_MARKERS:
        for marker in doc.xpath(xpath):
            parent = marker.getparent()
            if parent is None:
                continue
            for sibling in list(marker.itersiblings()):
                parent.remove(sibling)
            parent.remove(marker)
            removed = True
    for xpath in _QUOTE_SELECTORS:
        for node in doc.xpath(xpath):
            parent = node.getparent()
            if parent is not None:
                parent.remove(node)
                removed = True
    if not removed:
        return html
    text = str(lxml_html.tostring(doc, encoding="unicode"))
    return text if _has_text(text) else html


def _has_text(html: str) -> bool:
    try:
        return bool(lxml_html.document_fromstring(html).text_content().strip())
    except (ParserError, ValueError):
        return False


def safe_email_html(raw: bytes, *, drop_quotes: bool) -> SafeHtml | None:
    """The email's HTML part, cleaned for display; None if it has none (the plain text is shown instead)."""
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    assert isinstance(msg, EmailMessage)
    html = _html_part(msg)
    if not html or len(html) > MAX_HTML_BYTES:
        return None
    if drop_quotes:
        html = _drop_quoted_history(html)
    cleaned = nh3.clean(
        html, tags=TAGS, attributes=ATTRIBUTES, url_schemes={"http", "https", "mailto", "cid"},
        link_rel="noopener noreferrer nofollow", strip_comments=True, filter_style_properties=STYLE_PROPERTIES,
    )
    images = _inline_images(msg)
    cleaned = _CID_SRC.sub(lambda m: f'src="{images[m.group(1).lower()]}"' if m.group(1).lower() in images
                           else 'src=""', cleaned)
    remote = 0

    def hold_back(match: re.Match[str]) -> str:
        nonlocal remote
        remote += 1
        return f'<img{match.group(1)} data-ms-src="{match.group(2)}"'

    cleaned = _REMOTE_SRC.sub(hold_back, cleaned)
    if not _has_text(cleaned) and "<img" not in cleaned:
        return None
    return SafeHtml(cleaned, remote)
