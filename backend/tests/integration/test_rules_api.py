from tests.integration.conftest import sign_in

EXAM = {"all": [
    {"field": "from.domain", "op": "domain_matches", "value": "univ.edu"},
    {"field": "subject", "op": "contains", "value": ["exam", "admit card"]},
]}


async def test_rule_crud_order_and_isolation(client, sent):
    headers = await sign_in(client, sent)
    created = []
    for name in ("Exams", "Bank", "Jobs"):
        resp = await client.post("/api/v1/rules", headers=headers, json={"name": name, "condition": EXAM})
        assert resp.status_code == 201, resp.text
        created.append(resp.json())
    assert [r["position"] for r in created] == [1, 2, 3]

    ids = [created[2]["id"], created[0]["id"], created[1]["id"]]
    resp = await client.put("/api/v1/rules/order", headers=headers, json={"ids": ids})
    assert resp.status_code == 200
    listed = (await client.get("/api/v1/rules", headers=headers)).json()
    assert [r["name"] for r in listed] == ["Jobs", "Exams", "Bank"]

    resp = await client.patch(f"/api/v1/rules/{created[0]['id']}", headers=headers, json={"enabled": False})
    assert resp.json()["enabled"] is False

    other = await sign_in(client, sent, phone="+14155550199")
    assert (await client.get(f"/api/v1/rules/{created[0]['id']}", headers=other)).status_code == 404
    assert (await client.get("/api/v1/rules", headers=other)).json() == []

    assert (await client.delete(f"/api/v1/rules/{created[0]['id']}", headers=headers)).status_code == 204


async def test_invalid_condition_is_a_422_problem(client, sent):
    headers = await sign_in(client, sent)
    resp = await client.post("/api/v1/rules", headers=headers, json={
        "name": "bad", "condition": {"field": "subject", "op": "regex", "value": "("}})
    assert resp.status_code == 422
    assert resp.json()["code"] == "validation_error"


async def test_unknown_destination_rejected(client, sent):
    headers = await sign_in(client, sent)
    resp = await client.post("/api/v1/rules", headers=headers, json={
        "name": "x", "condition": EXAM,
        "actions": {"notify": {"destinations": ["01890000-0000-7000-8000-000000000000"]}}})
    assert resp.status_code == 422 and resp.json()["code"] == "invalid_reference"


async def test_plan_limit(client, sent):
    headers = await sign_in(client, sent)
    for i in range(10):
        assert (await client.post("/api/v1/rules", headers=headers,
                                  json={"name": f"r{i}", "condition": EXAM})).status_code == 201
    resp = await client.post("/api/v1/rules", headers=headers, json={"name": "one too many", "condition": EXAM})
    assert resp.status_code == 403 and resp.json()["code"] == "plan_limit"


async def test_dry_run_against_sample(client, sent):
    headers = await sign_in(client, sent)
    resp = await client.post("/api/v1/rules/test", headers=headers, json={
        "condition": EXAM,
        "sample": {"from_address": "Notices@Exam.Univ.edu", "subject": "Admit card for end-sem"},
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["matched"] == 1
    fields = (await client.get("/api/v1/rules/fields", headers=headers)).json()
    assert any(f["field"] == "from.domain" and "domain_matches" in f["ops"] for f in fields)


async def test_condition_errors_point_at_the_broken_condition(client, sent):
    headers = await sign_in(client, sent)
    resp = await client.post("/api/v1/rules", headers=headers, json={"name": "bad", "condition": {"all": [
        {"field": "subject", "op": "contains", "value": "ok"},
        {"field": "subject", "op": "regex", "value": "("},
    ]}})
    assert resp.status_code == 422
    locs = [e["loc"] for e in resp.json()["errors"]]
    assert ["body", "condition", "all", 1] in [loc[:4] for loc in locs]
    assert all("predicate" not in loc for loc in locs)


async def test_rule_round_trips_not_groups(client, sent):
    headers = await sign_in(client, sent)
    cond = {"not": {"field": "header:List-Unsubscribe", "op": "exists"}}
    rule = (await client.post("/api/v1/rules", headers=headers, json={"name": "n", "condition": cond})).json()
    assert rule["condition"]["not"]["field"] == "header:List-Unsubscribe"
    assert rule["actions"] == {"notify": {"destinations": [], "mode": "instant", "urgent": False}}
