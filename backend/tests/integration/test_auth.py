from tests.integration.conftest import sign_in


async def test_sign_up_creates_user_settings_and_self_destination(client, sent):
    headers = await sign_in(client, sent)
    me = (await client.get("/api/v1/me", headers=headers)).json()
    assert me["phone_e164"] == "+14155550123"
    assert me["role"] == "user"
    destinations = (await client.get("/api/v1/destinations", headers=headers)).json()
    assert [d["kind"] for d in destinations] == ["whatsapp_self"]
    assert destinations[0]["chat_id"] == "14155550123@c.us" and destinations[0]["is_default"]
    settings = (await client.get("/api/v1/me/settings", headers=headers)).json()
    assert settings["plan_limits"]["mailboxes"] == 3


async def test_admin_phones_get_admin_role(client, sent):
    headers = await sign_in(client, sent, phone="+14155550100")
    assert (await client.get("/api/v1/me", headers=headers)).json()["role"] == "admin"
    assert (await client.get("/api/v1/admin/queues", headers=headers)).status_code == 200


async def test_non_admin_is_forbidden_from_admin(client, sent):
    headers = await sign_in(client, sent)
    resp = await client.get("/api/v1/admin/queues", headers=headers)
    assert resp.status_code == 403
    assert resp.headers["content-type"].startswith("application/problem+json")


async def test_wrong_codes_are_limited(client, sent):
    await client.post("/api/v1/auth/otp/request", json={"phone": "+14155550123"})
    good = sent.last_code()
    bad = "000000" if good != "000000" else "111111"
    for _ in range(5):
        resp = await client.post("/api/v1/auth/otp/verify", json={"phone": "+14155550123", "code": bad})
        assert resp.status_code == 401
    resp = await client.post("/api/v1/auth/otp/verify", json={"phone": "+14155550123", "code": good})
    assert resp.status_code == 429  # code burned after too many attempts


async def test_code_requests_are_throttled(client, sent):
    for _ in range(3):
        assert (await client.post("/api/v1/auth/otp/request", json={"phone": "+14155550123"})).status_code == 200
    resp = await client.post("/api/v1/auth/otp/request", json={"phone": "+14155550123"})
    assert resp.status_code == 429
    assert int(resp.headers["retry-after"]) > 0


async def test_invalid_phone(client, sent):
    resp = await client.post("/api/v1/auth/otp/request", json={"phone": "+1234"})
    assert resp.status_code == 422
    assert resp.json()["code"] in ("invalid_phone", "validation_error")


async def test_refresh_rotation_and_reuse_detection(client, sent):
    await sign_in(client, sent)
    first = client.cookies.get("ms_refresh")
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 200
    second = client.cookies.get("ms_refresh")
    assert second and second != first

    # Replaying the old token revokes the whole family, including the new one.
    client.cookies.set("ms_refresh", first, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    client.cookies.set("ms_refresh", second, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_requests_without_token_are_rejected(client):
    resp = await client.get("/api/v1/rules")
    assert resp.status_code == 401
    resp = await client.get("/api/v1/rules", headers={"Authorization": "Bearer nope"})
    assert resp.status_code == 401 and resp.json()["code"] == "token_expired"
