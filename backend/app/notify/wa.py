"""Building blocks for WhatsApp messages, so every message has the same calm layout.

WhatsApp formatting: *bold*, _italic_, ~strike~, `code`, "> " quote, "- " bullets, "1. " numbered lists.
Email text is user content: run it through `plain` so a stray * or _ can't change the formatting.
"""

import re
from typing import Any

RULE = "───────────────"
_IMAGE_STUB = re.compile(r"^(image\d*|img_?\d*|outlook-[\w-]+|logo[\w-]*)\.(png|jpe?g|gif|bmp)$", re.I)
_BLANKS = re.compile(r"\n[ \t]*\n+")


_MARKER = re.compile(r"(?<![A-Za-z0-9])[*_~]|[*_~](?![A-Za-z0-9])")
_LOOKALIKE = {"*": "∗", "_": "ˍ", "~": "˜"}


def plain(text: str | None) -> str:
    """Neutralise WhatsApp formatting characters inside user content.

    Only markers at a word edge can start or end formatting, so 'Date_Sheet_2026.pdf' keeps its underscores.
    """
    return _MARKER.sub(lambda m: _LOOKALIKE[m.group(0)], (text or "").replace("`", "'"))


def clip(text: str | None, limit: int) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip(" ,;:-") + "…"


def strip_prefixes(subject: str) -> str:
    """'RE: Fwd: Viva slots' -> 'Viva slots'."""
    return re.sub(r"^\s*((re|fwd?|fw|aw|wg)\s*(\[\d+\])?\s*:\s*)+", "", subject or "", flags=re.I).strip()


def quote(text: str | None, *, max_chars: int, max_lines: int = 8) -> str:
    """A compact WhatsApp quote: one "> " line per line of text, no empty quote lines between paragraphs."""
    text = _BLANKS.sub("\n", (text or "").strip())
    if not text:
        return ""
    lines = [" ".join(line.split()) for line in text.split("\n") if line.strip()]
    out: list[str] = []
    used = 0
    for line in lines:
        room = max_chars - used
        if len(out) == max_lines or room <= 20:
            out[-1] = out[-1].rstrip(" .,;:") + " …"
            break
        if len(line) > room:
            out.append(line[: room - 1].rsplit(" ", 1)[0].rstrip(" ,;:-") + " …")
            break
        out.append(line)
        used += len(line)
    return "\n".join(f"> {plain(line)}" for line in out)


def chunks(text: str, limit: int = 3500) -> list[str]:
    """Split long text on paragraph (then line, then word) boundaries into WhatsApp-sized pieces."""
    text = text.strip()
    if len(text) <= limit:
        return [text] if text else []
    parts: list[str] = []
    current = ""
    for para in re.split(r"(\n\s*\n)", text):
        if len(current) + len(para) <= limit:
            current += para
            continue
        if current.strip():
            parts.append(current.strip())
        current = ""
        while len(para) > limit:
            cut = para.rfind("\n", 0, limit)
            cut = cut if cut > limit // 2 else para.rfind(" ", 0, limit)
            cut = cut if cut > limit // 2 else limit
            parts.append(para[:cut].strip())
            para = para[cut:]
        current = para
    if current.strip():
        parts.append(current.strip())
    return parts


def human_size(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.0f} KB"
    return f"{size / 1024 / 1024:.1f} MB"


def meaningful_files(files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attachments a person cares about: not signature logos or tracking pixels."""
    keep = []
    for f in files:
        name, size = str(f.get("name") or ""), int(f.get("size") or 0)
        is_image = str(f.get("type") or "").startswith("image/")
        if not name or (is_image and (size < 15_000 or _IMAGE_STUB.match(name))):
            continue
        keep.append(f)
    return keep


def files_line(files: list[dict[str, Any]], *, max_names: int = 2) -> str:
    """'📎 2 files: Date_Sheet.pdf, Instructions.docx' (names clipped, the rest counted)."""
    files = meaningful_files(files)
    if not files:
        return ""
    names = [plain(clip(f["name"], 40)) for f in files[:max_names]]
    more = f" +{len(files) - max_names} more" if len(files) > max_names else ""
    label = "1 file" if len(files) == 1 else f"{len(files)} files"
    return f"📎 {label}: {', '.join(names)}{more}"
