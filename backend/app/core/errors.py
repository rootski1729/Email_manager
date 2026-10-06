"""RFC 9457 problem+json errors."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import log

PROBLEM = "application/problem+json"


class AppError(Exception):
    status = 400
    code = "bad_request"

    def __init__(self, detail: str, *, code: str | None = None, status: int | None = None, **extra: Any):
        super().__init__(detail)
        self.detail = detail
        if code:
            self.code = code
        if status:
            self.status = status
        self.extra = extra


class NotFound(AppError):
    status = 404
    code = "not_found"


class Conflict(AppError):
    status = 409
    code = "conflict"


class Unauthorized(AppError):
    status = 401
    code = "unauthorized"


class Forbidden(AppError):
    status = 403
    code = "forbidden"


class TooManyRequests(AppError):
    status = 429
    code = "rate_limited"


class LimitReached(AppError):
    status = 403
    code = "plan_limit"


class UpstreamError(AppError):
    status = 502
    code = "upstream_error"


def _problem(status: int, code: str, detail: str, **extra: Any) -> JSONResponse:
    body = {"type": f"about:blank#{code}", "title": code.replace("_", " "), "status": status,
            "detail": detail, "code": code, **extra}
    headers = {"Retry-After": str(extra["retry_after"])} if "retry_after" in extra else None
    return JSONResponse(body, status_code=status, media_type=PROBLEM, headers=headers)


_UNION_TAGS = {"all", "any", "not", "predicate"}


def _clean_loc(loc: tuple[Any, ...] | list[Any]) -> list[Any]:
    """Drop rule-union tags pydantic adds: `condition.all.all.1.predicate.value` -> `condition.all.1.value`."""
    out: list[Any] = []
    for part in loc:
        if part == "predicate" or (part in _UNION_TAGS and out and out[-1] == part):
            continue
        out.append(part)
    return out


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _problem(exc.status, exc.code, exc.detail, **exc.extra)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _problem(exc.status_code, "http_error", str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [{"loc": _clean_loc(e["loc"]), "msg": e["msg"]} for e in exc.errors()]
        return _problem(422, "validation_error", "Request validation failed", errors=errors)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_error", path=request.url.path)
        return _problem(500, "internal_error", "Internal server error")
