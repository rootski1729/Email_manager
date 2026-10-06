import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from sqlalchemy import text

from app.api.routes import (
    admin,
    auth,
    destinations,
    mailboxes,
    me,
    messages,
    outbound,
    rules,
    stats,
    templates,
    webhooks,
)
from app.api.schemas import Problem
from app.core.config import get_settings
from app.core.db import dispose_engine, get_engine
from app.core.errors import install_error_handlers
from app.core.http import close_http
from app.core.logging import configure_logging, log
from app.core.redis import close_redis, get_redis
from app.services import compose, ingest
from app.workers.broker import broker
from app.workers.tasks import kick_send, kick_sync

REQUESTS = Counter("ms_http_requests_total", "HTTP requests", ["method", "route", "status"])
LATENCY = Histogram("ms_http_request_seconds", "HTTP latency", ["route"])


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    await broker.startup()
    ingest.kick_sync = kick_sync
    compose.kick_send = kick_send
    log.info("api_started", environment=get_settings().environment)
    yield
    await broker.shutdown()
    await dispose_engine()
    await close_redis()
    await close_http()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="MailSentinel API",
        version="0.1.0",
        description="Watch many mailboxes, match rules, and get the important ones on WhatsApp.",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    install_error_handlers(app)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        structlog.contextvars.bind_contextvars(request_id=request_id)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            structlog.contextvars.unbind_contextvars("request_id")
        route = getattr(request.scope.get("route"), "path", "unmatched")
        LATENCY.labels(route=route).observe(time.perf_counter() - start)
        REQUESTS.labels(method=request.method, route=route, status=response.status_code).inc()
        response.headers["x-request-id"] = request_id
        return response

    problem = {"model": Problem, "content": {"application/problem+json": {}}}
    api = APIRouter(prefix="/api/v1", responses={code: problem for code in (400, 401, 403, 404, 409, 429, 502)})
    for module in (auth, me, destinations, mailboxes, rules, messages, templates, outbound, stats, admin, webhooks):
        api.include_router(module.router)
    api.include_router(mailboxes.oauth_router)
    app.include_router(api)

    @app.get("/healthz", include_in_schema=False)
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz", include_in_schema=False)
    async def readyz(response: Response) -> dict[str, str]:
        checks: dict[str, str] = {}
        try:
            async with get_engine().connect() as conn:
                await conn.execute(text("SELECT 1"))
            checks["database"] = "ok"
        except Exception as exc:
            checks["database"] = f"error: {type(exc).__name__}"
        try:
            await get_redis().ping()
            checks["redis"] = "ok"
        except Exception as exc:
            checks["redis"] = f"error: {type(exc).__name__}"
        if any(v != "ok" for v in checks.values()):
            response.status_code = 503
        return checks

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    return app


app = create_app()
