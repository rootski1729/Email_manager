from datetime import datetime
from zoneinfo import ZoneInfo

from app.compose.when import describe, parse_when
from app.events.extract import day_first_for, from_ics, from_text, strip_quoted
from app.models import EventKind

IST = ZoneInfo("Asia/Kolkata")
RECEIVED = datetime(2026, 10, 6, 9, 0, tzinfo=IST)  # a Tuesday


def find(subject, body, **kw):
    return from_text(subject, body, received_at=RECEIVED, zone=IST, **kw)


def test_exam_date_and_time_in_body():
    [e] = find("Admit card released", "Your end-semester exam is on 12 Oct 2026 at 10:00 AM in Hall B.")
    assert e.kind == EventKind.exam and not e.all_day
    assert e.starts_at == datetime(2026, 10, 12, 10, 0, tzinfo=IST)
    assert e.confidence >= 0.9 and e.title.startswith("Exam: Admit card released")


def test_last_date_numeric_day_first_and_month_first():
    [e] = find("Fee notice", "The last date for fee payment is 15/10/2026.")
    assert e.kind in (EventKind.payment, EventKind.deadline) and e.all_day
    assert e.starts_at.date().isoformat() == "2026-10-15"
    us = from_text("Form", "Submit before 10/11/2026.", received_at=RECEIVED, zone=IST, day_first=False)
    assert us[0].starts_at.date().isoformat() == "2026-10-11"


def test_year_rolls_over_and_past_dates_are_ignored():
    dec = datetime(2026, 12, 20, 9, 0, tzinfo=IST)
    [e] = from_text("Interview", "Your interview is scheduled for Jan 5 at 3 pm.", received_at=dec, zone=IST)
    assert e.starts_at == datetime(2027, 1, 5, 15, 0, tzinfo=IST) and e.kind == EventKind.interview
    assert find("Results", "Results were declared on 1 Oct 2026.") == []


def test_dates_without_keywords_are_low_confidence_and_quoted_history_is_ignored():
    [e] = find("Hello", "See you on 20 October.")
    assert e.confidence < 0.5
    body = "Thanks!\n\nOn Mon, 5 Oct 2026 someone wrote:\n> Exam on 30 Oct 2026"
    assert find("Re: hi", body) == []
    assert "30 Oct" not in strip_quoted(body)


def test_relative_and_iso_dates():
    [e] = find("Reminder", "Webinar tomorrow at 6 pm.")
    assert e.starts_at == datetime(2026, 10, 7, 18, 0, tzinfo=IST) and e.kind == EventKind.meeting
    [e] = find("Deadline", "Submission deadline: 2026-10-20 23:59 hrs")
    assert e.starts_at.date().isoformat() == "2026-10-20"


def test_at_most_three_events_strongest_first():
    body = "Exam on 10 Oct. Exam on 11 Oct. Exam on 12 Oct. Exam on 13 Oct."
    events = find("Schedule", body)
    assert len(events) == 3


def test_ics_invite():
    ics = (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:abc@x\r\n"
        "SUMMARY:Technical interview\r\nDTSTART:20261014T053000Z\r\nDTEND:20261014T063000Z\r\n"
        "LOCATION:Google Meet\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
    )
    [e] = from_ics(ics, zone=IST)
    assert e.kind == EventKind.interview and e.confidence == 1.0 and e.location == "Google Meet"
    assert e.starts_at.astimezone(IST).hour == 11 and e.ics_uid == "abc@x" and not e.cancelled
    cancelled = from_ics(ics.replace("METHOD:REQUEST", "METHOD:CANCEL"), zone=IST)
    assert cancelled[0].cancelled
    assert from_ics("not a calendar", zone=IST) == []


def test_day_first_by_timezone():
    assert day_first_for("Asia/Kolkata") and not day_first_for("America/New_York")


def test_parse_when():
    now = RECEIVED
    assert parse_when("2h", now=now, zone=IST) == datetime(2026, 10, 6, 11, 0, tzinfo=IST)
    assert parse_when("in 30 min", now=now, zone=IST) == datetime(2026, 10, 6, 9, 30, tzinfo=IST)
    assert parse_when("tomorrow 9am", now=now, zone=IST) == datetime(2026, 10, 7, 9, 0, tzinfo=IST)
    assert parse_when("tomorrow", now=now, zone=IST) == datetime(2026, 10, 7, 9, 0, tzinfo=IST)
    assert parse_when("mon 8:30", now=now, zone=IST) == datetime(2026, 10, 12, 8, 30, tzinfo=IST)
    assert parse_when("tue", now=now, zone=IST) == datetime(2026, 10, 13, 9, 0, tzinfo=IST)  # next Tuesday
    assert parse_when("6pm", now=now, zone=IST) == datetime(2026, 10, 6, 18, 0, tzinfo=IST)
    assert parse_when("8am", now=now, zone=IST) == datetime(2026, 10, 7, 8, 0, tzinfo=IST)  # already past
    assert parse_when("at 5", now=now, zone=IST) == datetime(2026, 10, 6, 17, 0, tzinfo=IST)
    assert parse_when("3 days", now=now, zone=IST) == datetime(2026, 10, 9, 9, 0, tzinfo=IST)
    for bad in ("", "whenever", "25:00", "999 weeks", "0h"):
        assert parse_when(bad, now=now, zone=IST) is None
    assert describe(datetime(2026, 10, 7, 9, 0, tzinfo=IST), now=now, zone=IST) == "tomorrow 09:00"


def test_packs_compile_and_suggest():
    from uuid import uuid4

    from app.rules.envelope import Envelope
    from app.rules.packs import PACKS, pack_hits, personal_senders

    assert len({p.id for p in PACKS}) == len(PACKS) >= 8

    def env(sender, subject, **headers):
        return Envelope(mailbox_id=uuid4(), provider_message_id=subject, received_at=RECEIVED, from_address=sender,
                        subject=subject, headers={k.lower().replace("_", "-"): [v] for k, v in headers.items()})

    envs = [env("exams@akgec.ac.in", "Hall ticket for end-sem"), env("dean@mail.akgec.ac.in", "Meeting"),
            env("promo@akgec.ac.in", "Admit card offer", List_Unsubscribe="<x>"),
            env("friend@gmail.com", "Exam notes"), env("noreply@bank.com", "Amount debited")]
    hits = {h.pack.id: h.count for h in pack_hits(envs)}
    assert hits["exams"] == 1 and hits["bank"] == 1  # the newsletter copy doesn't count
    [s] = personal_senders(envs)
    assert s.domain == "akgec.ac.in" and s.count == 2


def test_specific_phrases_win_over_generic_words():
    events = find("Hall ticket released",
                  "The first paper is on 15 October 2026 at 10:00 AM. The last date to pay the exam fee is 11/10/2026.")
    kinds = {e.starts_at.date().isoformat(): e.kind for e in events}
    assert kinds == {"2026-10-15": EventKind.exam, "2026-10-11": EventKind.deadline}


def test_several_dates_in_one_email_get_distinct_titles():
    events = find("Hall ticket released",
                  "The first paper is on 15 October 2026 at 10:00 AM. The last date to pay the exam fee is 11/10/2026.")
    titles = {e.kind: e.title for e in events}
    assert titles[EventKind.exam] == "Exam: The first paper is on 15 October 2026 at 10:00 AM."
    assert titles[EventKind.deadline].startswith("Deadline: The last date to pay the exam fee")
    [single] = find("Admit card released", "Your exam is on 12 Oct 2026 at 10:00 AM.")
    assert single.title == "Exam: Admit card released"
