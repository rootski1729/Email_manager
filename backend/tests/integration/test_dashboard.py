"""Dashboard numbers come from what actually happened: emails matched, alerts delivered and read, emails sent."""

from sqlalchemy import update

from app.core.db import session_factory
from app.models import Notification, NotificationStatus
from app.notify.dispatcher import Dispatcher
from app.services import ingest
from tests.integration.test_engagement import mail, no_delay, ready  # noqa: F401  (fixtures)
from tests.integration.test_pipeline import FakeWaha


async def test_dashboard_counts_the_period(client, ready, infra):  # noqa: F811
    headers, mailbox_id = ready
    mail(infra, "student@example.com", "Admit card released", "Exam on 15 October.")
    mail(infra, "student@example.com", "Fee notice", "Pay the fee.", sender="Accounts <fees@univ.edu>")
    await ingest.sync_mailbox(mailbox_id)
    await Dispatcher(waha=FakeWaha(), sleep=False).tick()  # type: ignore[arg-type]
    async with session_factory()() as db:  # WhatsApp reported the alert as read
        await db.execute(update(Notification).values(status=NotificationStatus.read))
        await db.commit()

    resp = await client.get("/api/v1/stats/dashboard?days=7", headers=headers)
    assert resp.status_code == 200, resp.text
    d = resp.json()
    assert d["period_days"] == 7 and d["important"] == 2 and d["important_prev"] == 0
    assert d["alerts"] >= 1 and d["read_rate"] == 1.0 and d["delivery_rate"] == 1.0
    assert len(d["activity"]) == 7 and d["activity"][-1]["important"] == 2
    assert d["by_rule"] == [{"name": "Exams", "count": 2, "address": None}]
    assert {s["address"] for s in d["top_senders"]} == {"notices@exam.univ.edu", "fees@univ.edu"}
    assert (await client.get("/api/v1/stats/dashboard?days=0", headers=headers)).status_code == 422
