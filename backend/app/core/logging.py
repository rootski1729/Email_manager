import logging
import re
import sys

import structlog

from app.core.config import get_settings

_PHONE = re.compile(r"\+?\d{6,}(\d{4})")
_EMAIL = re.compile(r"([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@")


def mask(value: str) -> str:
    """Mask phone numbers and email local parts so logs don't carry personal data."""
    value = _PHONE.sub(r"***\1", value)
    return _EMAIL.sub(r"\1***@", value)


def _mask_processor(_: object, __: str, event_dict: dict) -> dict:
    for key, value in event_dict.items():
        if isinstance(value, str) and key not in ("timestamp", "level", "logger"):
            event_dict[key] = mask(value)
    return event_dict


def configure_logging() -> None:
    settings = get_settings()
    level = logging.getLevelNamesMapping().get(settings.log_level.upper(), logging.INFO)
    shared = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        _mask_processor,
    ]
    renderer = (
        structlog.processors.JSONRenderer() if settings.log_json else structlog.dev.ConsoleRenderer()
    )
    structlog.configure(
        processors=[*shared, structlog.processors.format_exc_info, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(sys.stdout),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(level=level, stream=sys.stdout, format="%(levelname)s %(name)s %(message)s")
    for noisy in ("httpx", "httpcore", "aioimaplib"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


log = structlog.get_logger()
