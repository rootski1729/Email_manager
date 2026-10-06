"""Database browser for admins: every table, with search, edit, delete and CSV export.

Guard rails: secret columns are never returned or exported; keys, links between tables and timestamps can't be
edited; the audit log and admin accounts are read-only here; every change is written to the audit log.
"""

import csv
import enum
import io
import json
import uuid
from collections.abc import AsyncIterator
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Body, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import ARRAY, Column, Table, cast, delete, func, or_, select, update
from sqlalchemy import Enum as SAEnum
from sqlalchemy import String as SAString
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import Boolean, DateTime, Float, Integer, LargeBinary, String, Text, Uuid

from app import models  # noqa: F401 - registers every table
from app.api.admin.schemas import DbColumn, DbRows, DbTable
from app.api.deps import DB, AdminUser, client_ip
from app.core.db import Base
from app.core.errors import AppError, NotFound
from app.services import admin_auth
from app.services.rulesets import bump_version

router = APIRouter(prefix="/admin/db", tags=["admin"])

TABLE_INFO: dict[str, tuple[str, str]] = {
    "users": ("Clients", "People who use MailSentinel (one per WhatsApp number)."),
    "user_settings": ("Client settings", "Quiet hours, digest, recap, muted senders…"),
    "destinations": ("WhatsApp destinations", "Numbers and groups that receive alerts."),
    "mailboxes": ("Mailboxes", "Connected Gmail and IMAP accounts."),
    "rules": ("Rules", "What each client watches for."),
    "messages": ("Matched emails", "Emails that matched a rule (only these are stored)."),
    "rule_matches": ("Rule matches", "Which rules matched which email."),
    "notifications": ("WhatsApp messages", "Every alert, reminder and reply, with delivery status."),
    "events": ("Upcoming dates", "Exams, interviews and deadlines found in emails."),
    "email_templates": ("Email templates", "Saved forms for /email on WhatsApp."),
    "outbound_emails": ("Emails sent from WhatsApp", "Composed with /email or /reply."),
    "outbound_attachments": ("Email attachments", "Files sent on WhatsApp for outgoing emails."),
    "refresh_tokens": ("Client sessions", "Signed-in devices. Delete one to sign that device out."),
    "app_settings": ("App settings", "Values changed in the admin console (secrets hidden)."),
    "admin_accounts": ("Admins", "Admin console accounts (manage them on the Admins page)."),
    "admin_audit": ("Audit log", "Everything done in the admin console. Read-only."),
}
HIDDEN_TABLES = {"admin_sessions"}
READ_ONLY_TABLES = {"admin_audit", "admin_accounts", "app_settings"}
SECRET_COLUMNS = {("mailboxes", "credentials"), ("refresh_tokens", "token_hash"), ("admin_accounts", "password_hash"),
                  ("outbound_attachments", "content"), ("user_settings", "calendar_token"), ("app_settings", "secret")}
NEVER_EDIT = {"id", "created_at", "updated_at"}
EXPORT_LIMIT = 50_000


def _table(name: str) -> Table:
    if name in HIDDEN_TABLES or name not in Base.metadata.tables:
        raise NotFound("Unknown table")
    return Base.metadata.tables[name]


def _pk(table: Table) -> Column:
    [pk] = list(table.primary_key.columns)
    return pk


def _secret(table: Table, column: Column) -> bool:
    return (table.name, column.name) in SECRET_COLUMNS or isinstance(column.type, LargeBinary)


def _editable(table: Table, column: Column) -> bool:
    return (table.name not in READ_ONLY_TABLES and not column.primary_key and not column.foreign_keys
            and column.name not in NEVER_EDIT and not _secret(table, column))


def _type_name(column: Column) -> str:
    t = column.type
    if isinstance(t, SAEnum):
        return "enum:" + ",".join(t.enums)
    if isinstance(t, JSONB):
        return "json"
    if isinstance(t, ARRAY):
        return "array"
    for kind, label in ((Boolean, "boolean"), (Integer, "integer"), (Float, "number"), (DateTime, "datetime"),
                        (Uuid, "uuid"), (LargeBinary, "binary"), (Text, "text"), (String, "text")):
        if isinstance(t, kind):
            return label
    return str(t).lower()


def _plain(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, bytes | memoryview):
        return f"<{len(bytes(value))} bytes>"
    if isinstance(value, list):
        return [_plain(v) for v in value]
    return value


def _row(table: Table, row: Any) -> dict[str, Any]:
    data = dict(row._mapping)
    out: dict[str, Any] = {}
    for c in table.columns:
        value = data.get(c.name)
        out[c.name] = ("••••••" if value is not None else None) if _secret(table, c) else _plain(value)
    return out


def _coerce(column: Column, value: Any) -> Any:
    """Turn JSON input into the column's Python type, with a readable error."""
    if value is None:
        if not column.nullable:
            raise AppError(f"{column.name} can't be empty", code="invalid_value", status=422)
        return None
    t = column.type
    try:
        if isinstance(t, SAEnum):
            if str(value) not in t.enums:
                raise ValueError(f"use one of {', '.join(t.enums)}")
            return t.enum_class(value) if t.enum_class else str(value)
        if isinstance(t, Boolean):
            if isinstance(value, str):
                return value.strip().lower() in ("1", "true", "yes", "on")
            return bool(value)
        if isinstance(t, Integer):
            return int(value)
        if isinstance(t, Float):
            return float(value)
        if isinstance(t, DateTime):
            parsed = datetime.fromisoformat(str(value))
            if parsed.tzinfo is None:
                raise ValueError("include a timezone, e.g. 2026-10-12T10:00:00+05:30")
            return parsed
        if isinstance(t, JSONB):
            return json.loads(value) if isinstance(value, str) else value
        if isinstance(t, ARRAY):
            items = json.loads(value) if isinstance(value, str) and value.strip().startswith("[") else value
            if isinstance(items, str):
                items = [v.strip() for v in items.split(",") if v.strip()]
            return [uuid.UUID(str(v)) if isinstance(t.item_type, Uuid) else v for v in items]
        if isinstance(t, String) and t.length and len(str(value)) > t.length:
            raise ValueError(f"at most {t.length} characters")
        return str(value)
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise AppError(f"{column.name}: {exc}", code="invalid_value", status=422) from exc


def _pk_value(table: Table, raw: str) -> Any:
    pk = _pk(table)
    if isinstance(pk.type, Uuid):
        try:
            return uuid.UUID(raw)
        except ValueError as exc:
            raise NotFound("Row not found") from exc
    return raw


@router.get("/tables", response_model=list[DbTable])
async def tables(_: AdminUser, db: DB) -> list[DbTable]:
    out: list[DbTable] = []
    for table in Base.metadata.sorted_tables:
        if table.name in HIDDEN_TABLES:
            continue
        rows = await db.scalar(select(func.count()).select_from(table)) or 0
        label, description = TABLE_INFO.get(table.name, (table.name.replace("_", " ").title(), ""))
        out.append(DbTable(
            name=table.name, label=label, description=description, rows=rows,
            can_delete=table.name not in READ_ONLY_TABLES, can_edit=table.name not in READ_ONLY_TABLES,
            columns=[DbColumn(name=c.name, type=_type_name(c), nullable=bool(c.nullable), editable=_editable(table, c),
                              hidden=_secret(table, c), primary_key=c.primary_key) for c in table.columns],
        ))
    out.sort(key=lambda t: list(TABLE_INFO).index(t.name) if t.name in TABLE_INFO else 99)
    return out


def _query(table: Table, q: str | None, order: str | None, desc: bool):
    stmt = select(table)
    if q:
        q = q.strip()
        try:
            as_uuid = uuid.UUID(q)
        except ValueError:
            as_uuid = None
        conditions = []
        for c in table.columns:
            if _secret(table, c):
                continue
            if as_uuid is not None and isinstance(c.type, Uuid):
                conditions.append(c == as_uuid)
            elif isinstance(c.type, String | Text) and not isinstance(c.type, SAEnum):
                conditions.append(c.ilike(f"%{q}%"))
            elif isinstance(c.type, SAEnum):
                conditions.append(cast(c, SAString).ilike(f"%{q}%"))
        if conditions:
            stmt = stmt.where(or_(*conditions))
    sort = table.columns.get(order) if order else None
    if sort is None:
        sort = table.columns.get("created_at")
    if sort is None:
        sort = _pk(table)
    return stmt.order_by(sort.desc() if desc else sort.asc())


@router.get("/{table_name}", response_model=DbRows)
async def rows(
    table_name: str, _: AdminUser, db: DB, q: str | None = None, order: str | None = None, desc: bool = True,
    offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
) -> DbRows:
    table = _table(table_name)
    stmt = _query(table, q, order, desc)
    total = await db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    result = (await db.execute(stmt.offset(offset).limit(limit))).all()
    return DbRows(table=table.name, total=total, rows=[_row(table, r) for r in result])


@router.get("/{table_name}/export.csv", response_class=StreamingResponse,
            responses={200: {"content": {"text/csv": {}}, "description": "CSV file"}})
async def export_csv(table_name: str, admin: AdminUser, db: DB, request: Request, q: str | None = None
                     ) -> StreamingResponse:
    table = _table(table_name)
    result = (await db.execute(_query(table, q, None, True).limit(EXPORT_LIMIT))).all()
    await admin_auth.record(db, admin, "db.export", target_type="table", target_id=table.name,
                            details={"rows": len(result)}, ip=client_ip(request))
    await db.commit()
    columns = [c.name for c in table.columns if not _secret(table, c)]

    async def stream() -> AsyncIterator[str]:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(columns)
        for r in result:
            data = _row(table, r)
            writer.writerow([json.dumps(v) if isinstance(v, dict | list) else v for v in (data[c] for c in columns)])
            if buffer.tell() > 64_000:
                yield buffer.getvalue()
                buffer.seek(0)
                buffer.truncate()
        yield buffer.getvalue()

    filename = f"{table.name}-{datetime.now():%Y%m%d-%H%M}.csv"
    return StreamingResponse(stream(), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.patch("/{table_name}/{pk}", response_model=dict[str, Any])
async def edit_row(
    table_name: str, pk: str, admin: AdminUser, db: DB, request: Request,
    values: dict[str, Any] = Body(..., embed=True),
) -> dict[str, Any]:
    table = _table(table_name)
    if table.name in READ_ONLY_TABLES:
        raise AppError("This table is read-only here", code="read_only", status=403)
    key = _pk_value(table, pk)
    changes: dict[str, Any] = {}
    for name, value in values.items():
        column = table.columns.get(name)
        if column is None:
            raise AppError(f"Unknown column {name}", code="invalid_column", status=422)
        if not _editable(table, column):
            raise AppError(f"{name} can't be edited", code="not_editable", status=422)
        changes[name] = _coerce(column, value)
    if not changes:
        raise AppError("Nothing to change", code="no_changes", status=422)
    result = await db.execute(update(table).where(_pk(table) == key).values(**changes).returning(*table.columns))
    row = result.first()
    if row is None:
        raise NotFound("Row not found")
    await admin_auth.record(db, admin, "db.edit", target_type=table.name, target_id=pk,
                            details={k: _plain(v) for k, v in changes.items()}, ip=client_ip(request))
    await db.commit()
    if table.name == "rules":
        await bump_version(row._mapping["user_id"])
    return _row(table, row)


@router.delete("/{table_name}/{pk}", status_code=204)
async def delete_row(table_name: str, pk: str, admin: AdminUser, db: DB, request: Request) -> None:
    table = _table(table_name)
    if table.name in READ_ONLY_TABLES:
        raise AppError("This table is read-only here", code="read_only", status=403)
    key = _pk_value(table, pk)
    result = await db.execute(delete(table).where(_pk(table) == key).returning(*table.columns))
    row = result.first()
    if row is None:
        raise NotFound("Row not found")
    await admin_auth.record(db, admin, "db.delete", target_type=table.name, target_id=pk, ip=client_ip(request))
    await db.commit()
    if table.name == "rules":
        await bump_version(row._mapping["user_id"])
