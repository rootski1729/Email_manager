"""Admin console: separate sign-in, clients, WhatsApp, Google config, test lab, database browser, audit."""

import pytest
from sqlalchemy import select

from app.core.db import session_factory
from app.core.runtime import google_config
from app.models import AdminAudit, Rule, User
from tests.integration.conftest import sign_in

ADMIN = {"username": "admin", "password": "test-admin-password"}


async def admin_headers(client) -> dict[str, str]:
    resp = await client.post("/api/v1/admin/auth/login", json=ADMIN)
    assert resp.status_code == 200, resp.text
    assert "ms_admin" in resp.headers.get("set-cookie", "")
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def audit_actions() -> list[str]:
    async with session_factory()() as db:
        return [a.action for a in (await db.scalars(select(AdminAudit).order_by(AdminAudit.created_at))).all()]


async def test_admin_login_lockout_refresh_and_isolation(client, sent):
    for _ in range(5):
        bad = await client.post("/api/v1/admin/auth/login", json={**ADMIN, "password": "wrong"})
        assert bad.status_code == 401 and bad.json()["code"] == "invalid_credentials"
    locked = await client.post("/api/v1/admin/auth/login", json=ADMIN)  # even the right password
    assert locked.status_code == 429
    async with session_factory()() as db:
        from app.models import AdminAccount

        admin = await db.scalar(select(AdminAccount))
        admin.locked_until = None
        await db.commit()

    headers = await admin_headers(client)
    assert (await client.get("/api/v1/admin/me", headers=headers)).json()["username"] == "admin"
    refreshed = await client.post("/api/v1/admin/auth/refresh")  # cookie from the login
    assert refreshed.status_code == 200 and refreshed.json()["access_token"]

    # Tokens are not interchangeable between the two apps.
    client_headers = await sign_in(client, sent)
    assert (await client.get("/api/v1/admin/overview", headers=client_headers)).status_code == 401
    assert (await client.get("/api/v1/me", headers=headers)).status_code == 401
    assert (await client.post("/api/v1/admin/auth/login", json={"username": "nobody", "password": "x"})
            ).status_code == 401


async def test_overview_and_health(client, sent):
    headers = await admin_headers(client)
    await sign_in(client, sent)
    data = (await client.get("/api/v1/admin/overview", headers=headers)).json()
    assert data["clients"] == 1 and len(data["series"]) == 14
    keys = {h["key"] for h in data["health"]}
    assert {"database", "redis", "whatsapp", "worker", "google"} <= keys
    assert next(h for h in data["health"] if h["key"] == "database")["ok"]


async def test_manage_clients(client, sent):
    headers = await admin_headers(client)
    created = await client.post("/api/v1/admin/clients", headers=headers,
                                json={"phone": "+919876543210", "display_name": "Asha", "plan": "pro"})
    assert created.status_code == 201, created.text
    client_id = created.json()["id"]
    assert (await client.post("/api/v1/admin/clients", headers=headers, json={"phone": "+919876543210"})
            ).status_code == 409
    page = (await client.get("/api/v1/admin/clients?q=asha", headers=headers)).json()
    assert page["total"] == 1 and page["items"][0]["plan"] == "pro"

    # The client signs in, then gets disabled: their session ends.
    client_headers = await sign_in(client, sent, phone="+919876543210")
    await client.post("/api/v1/rules", headers=client_headers, json={
        "name": "Exams", "condition": {"field": "subject", "op": "contains", "value": "exam"}})
    detail = (await client.get(f"/api/v1/admin/clients/{client_id}", headers=headers)).json()
    assert detail["client"]["rules"] == 1 and detail["destinations"][0]["kind"] == "whatsapp_self"
    resp = await client.patch(f"/api/v1/admin/clients/{client_id}", headers=headers, json={"is_active": False})
    assert resp.status_code == 200 and resp.json()["is_active"] is False
    assert (await client.get("/api/v1/me", headers=client_headers)).status_code == 401

    rule_id = (await client.get(f"/api/v1/admin/rules?client_id={client_id}", headers=headers)).json()[0]["id"]
    assert (await client.patch(f"/api/v1/admin/rules/{rule_id}", headers=headers, json={"enabled": False})
            ).json()["enabled"] is False
    msg = await client.post(f"/api/v1/admin/clients/{client_id}/message", headers=headers, json={"text": "Hello"})
    assert msg.status_code == 202
    assert (await client.delete(f"/api/v1/admin/clients/{client_id}", headers=headers)).status_code == 204
    async with session_factory()() as db:
        assert await db.get(User, client_id) is None
        assert (await db.scalars(select(Rule))).all() == []  # cascaded
    assert {"client.created", "client.updated", "rule.updated", "client.messaged", "client.deleted"} <= set(
        await audit_actions())


async def test_google_config_saved_encrypted_and_used(client):
    headers = await admin_headers(client)
    before = (await client.get("/api/v1/admin/config/google", headers=headers)).json()
    assert before["source"] == "environment" and not before["oauth_ready"]
    resp = await client.put("/api/v1/admin/config/google", headers=headers, json={
        "client_id": "123-abc.apps.googleusercontent.com", "client_secret": "GOCSPX-test-secret",
        "project_id": "my-proj"})
    data = resp.json()
    assert data["source"] == "database" and data["client_secret_set"] and data["oauth_ready"]
    assert "GOCSPX" not in resp.text  # the secret never comes back
    assert data["redirect_uri"].endswith("/api/v1/oauth/google/callback")
    config = await google_config()
    assert config.client_secret == "GOCSPX-test-secret" and config.project_id == "my-proj"

    # Saving without a secret keeps the stored one.
    await client.put("/api/v1/admin/config/google", headers=headers,
                     json={"client_id": "456-x.apps.googleusercontent.com", "client_secret": ""})
    assert (await google_config()).client_secret == "GOCSPX-test-secret"

    rows = (await client.get("/api/v1/admin/db/app_settings", headers=headers)).json()["rows"]
    assert rows[0]["secret"] == "••••••"
    reset = (await client.delete("/api/v1/admin/config/google", headers=headers)).json()
    assert reset["source"] == "environment"


async def test_whatsapp_controls(client, monkeypatch):
    headers = await admin_headers(client)
    calls: list[str] = []

    class FakeWaha:
        async def session_info(self):
            return {"status": "SCAN_QR_CODE"}

        async def qr_code(self):
            return {"mimetype": "image/png", "data": "QUJD"}

        async def logout_session(self):
            calls.append("logout")

    monkeypatch.setattr("app.api.admin.system.WahaClient", FakeWaha)
    data = (await client.get("/api/v1/admin/waha", headers=headers)).json()
    assert data["status"] == "SCAN_QR_CODE" and data["qr"] == "data:image/png;base64,QUJD"
    assert (await client.post("/api/v1/admin/waha/logout", headers=headers)).status_code == 200
    assert calls == ["logout"] and "whatsapp.logout" in await audit_actions()


async def test_test_lab(client, monkeypatch):
    headers = await admin_headers(client)
    rule = await client.post("/api/v1/admin/tools/rule", headers=headers, json={
        "condition": {"all": [{"field": "from.domain", "op": "domain_matches", "value": "univ.edu"},
                              {"not": {"field": "subject", "op": "contains", "value": "newsletter"}}]},
        "from_address": "exams@exam.univ.edu", "subject": "Admit card"})
    data = rule.json()
    assert data["matched"] is True
    assert data["explanation"][0] == "✓ all of these:" and "sender domain" in data["explanation"][1]

    dates = (await client.post("/api/v1/admin/tools/dates", headers=headers, json={
        "subject": "Interview", "body": "Your interview is on 12 Dec 2099 at 3 pm."})).json()
    assert dates == [] or dates[0]["kind"] == "interview"  # 2099 is beyond the 2-year horizon
    dates = (await client.post("/api/v1/admin/tools/dates", headers=headers, json={
        "subject": "Interview", "body": "Your interview is tomorrow at 3 pm."})).json()
    assert dates[0]["kind"] == "interview" and not dates[0]["all_day"]

    sent: list[tuple[str, str]] = []

    async def fake_send(chat_id: str, text: str) -> str:
        sent.append((chat_id, text))
        return "wamid-1"

    monkeypatch.setattr("app.api.admin.tools.send_now", fake_send)
    result = (await client.post("/api/v1/admin/tools/whatsapp", headers=headers,
                                json={"phone": "+919876543210", "text": "ping"})).json()
    assert result["ok"] and sent == [("919876543210@c.us", "ping")]

    bad = (await client.post("/api/v1/admin/tools/mailbox", headers=headers, json={
        "address": "a@b.c", "credentials": {"host": "127.0.0.1", "port": 1, "security": "plain",
                                            "username": "a", "password": "b"}})).json()
    assert bad[0]["ok"] is False


async def test_database_browser(client, sent):
    headers = await admin_headers(client)
    await sign_in(client, sent)
    tables = {t["name"]: t for t in (await client.get("/api/v1/admin/db/tables", headers=headers)).json()}
    assert "admin_sessions" not in tables and tables["users"]["rows"] == 1
    assert tables["admin_audit"]["can_edit"] is False
    columns = {c["name"]: c for c in tables["mailboxes"]["columns"]}
    assert columns["credentials"]["hidden"] and not columns["credentials"]["editable"]
    assert not columns["user_id"]["editable"] and columns["display_name"]["editable"]

    users = (await client.get("/api/v1/admin/db/users?q=4155550123", headers=headers)).json()
    assert users["total"] == 1
    user_id = users["rows"][0]["id"]
    edited = await client.patch(f"/api/v1/admin/db/users/{user_id}", headers=headers,
                                json={"values": {"display_name": "Rahul", "plan": "pro"}})
    assert edited.status_code == 200 and edited.json()["display_name"] == "Rahul"
    for values, code in (({"id": user_id}, "not_editable"), ({"role": "god"}, "invalid_value"),
                         ({"nope": 1}, "invalid_column")):
        resp = await client.patch(f"/api/v1/admin/db/users/{user_id}", headers=headers, json={"values": values})
        assert resp.status_code == 422 and resp.json()["code"] == code
    assert (await client.patch("/api/v1/admin/db/admin_audit/x", headers=headers,
                               json={"values": {"action": "x"}})).status_code == 403

    csv_resp = await client.get("/api/v1/admin/db/refresh_tokens/export.csv", headers=headers)
    assert csv_resp.status_code == 200 and "token_hash" not in csv_resp.text.splitlines()[0]

    tokens = (await client.get("/api/v1/admin/db/refresh_tokens", headers=headers)).json()["rows"]
    assert tokens[0]["token_hash"] == "••••••"
    assert (await client.delete(f"/api/v1/admin/db/refresh_tokens/{tokens[0]['id']}", headers=headers)
            ).status_code == 204
    assert {"db.edit", "db.export", "db.delete"} <= set(await audit_actions())
    audit = (await client.get("/api/v1/admin/audit", headers=headers)).json()
    assert audit[0]["admin_username"] == "admin"


@pytest.mark.parametrize("path", ["/api/v1/admin/overview", "/api/v1/admin/clients", "/api/v1/admin/db/tables",
                                  "/api/v1/admin/config/google", "/api/v1/admin/audit"])
async def test_every_admin_route_requires_admin(client, path):
    assert (await client.get(path)).status_code == 401
