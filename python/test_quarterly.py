"""Idempotent regression test for the 90-Day / 112-Day Transformation
Board. No pytest dependency:

    .venv/bin/python test_quarterly.py

Every test gets its own fresh temp SQLite DB, deleted immediately after
— never touches the real app.db.
"""

import os
import tempfile
import traceback
from datetime import date, timedelta

from alembic import command
from alembic.config import Config

FAILURES = []


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(label)


class FreshDB:
    def __enter__(self):
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        os.environ["APP_DB_PATH"] = self.path

        import importlib
        import database.connection as connection
        importlib.reload(connection)

        cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
        command.upgrade(cfg, "head")

        from database.repository import QuarterlyRepository

        self.db = connection.SessionLocal()
        self.repo = QuarterlyRepository(self.db)
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


def test_default_panel_falls_back_to_calendar_quarter():
    with FreshDB() as f:
        import engine.quarterly as q
        panel = q.get_panel(f.repo)
        today = date.today()
        expected_month = 3 * ((today.month - 1) // 3) + 1
        expected_start = date(today.year, expected_month, 1)
        check("no anchor set -> falls back to the calendar quarter", panel["cycle_start"] == str(expected_start))
        check("all 6 areas present with the right keys", [a["key"] for a in panel["areas"]] == [
            "appearance", "money", "relationship", "health", "social", "mind",
        ])
        check("fresh panel has 0/6 areas done (proven)", panel["areas_done"] == 0 and panel["areas_total"] == 6)
        check("a fresh area's status is not_started", panel["areas"][0]["status"] == "not_started")


def test_status_progression_through_the_7_steps():
    with FreshDB() as f:
        import engine.quarterly as q

        p = q.set_field(f.repo, "money", "current_reality", "12,000 saved")
        area = next(a for a in p["areas"] if a["key"] == "money")
        check("current_reality alone is not enough to leave not_started", area["status"] == "not_started")

        p = q.set_field(f.repo, "money", "destination", "50,000 saved")
        area = next(a for a in p["areas"] if a["key"] == "money")
        check("current_reality + destination -> defined", area["status"] == "defined")

        p = q.set_field(f.repo, "money", "gap", "38,000 short, no automated saving")
        area = next(a for a in p["areas"] if a["key"] == "money")
        check("gap alone without a major change is still defined", area["status"] == "defined")

        p = q.set_major_changes(f.repo, "money", [{"text": "automate a weekly transfer", "done": False}])
        area = next(a for a in p["areas"] if a["key"] == "money")
        check("gap + a major change -> planned", area["status"] == "planned")

        p = q.set_field(f.repo, "money", "weekly_lead_behavior", "transfer 500 every Friday")
        area = next(a for a in p["areas"] if a["key"] == "money")
        check("a weekly lead behavior -> active", area["status"] == "active")

        p = q.set_achieved(f.repo, "money", True)
        area = next(a for a in p["areas"] if a["key"] == "money")
        check("achieved=True without proof does NOT reach proven", area["status"] == "active")

        p = q.set_field(f.repo, "money", "proof", "bank statement shows 50,000")
        area = next(a for a in p["areas"] if a["key"] == "money")
        check("achieved + proof -> proven", area["status"] == "proven")
        check("areas_done counts the proven area", p["areas_done"] == 1)


def test_set_field_rejects_invalid_area_or_field():
    with FreshDB() as f:
        import engine.quarterly as q
        try:
            q.set_field(f.repo, "not-a-real-area", "destination", "x")
            raised = False
        except ValueError:
            raised = True
        check("invalid area raises ValueError", raised)

        try:
            q.set_field(f.repo, "money", "not-a-real-field", "x")
            raised = False
        except ValueError:
            raised = True
        check("invalid field raises ValueError", raised)

        try:
            q.set_field(f.repo, "money", "out", "x")
            raised = False
        except ValueError:
            raised = True
        check("the old 'out' field name is no longer accepted", raised)


def test_major_changes_capped_at_five_and_ids_assigned():
    with FreshDB() as f:
        import engine.quarterly as q
        panel = q.set_major_changes(f.repo, "health", [{"text": f"change {i}"} for i in range(5)])
        area = next(a for a in panel["areas"] if a["key"] == "health")
        check("5 major changes accepted", len(area["major_changes"]) == 5)
        check("auto-assigned ids are unique", len({c["id"] for c in area["major_changes"]}) == 5)

        try:
            q.set_major_changes(f.repo, "health", [{"text": f"change {i}"} for i in range(6)])
            raised = False
        except ValueError:
            raised = True
        check("a 6th major change is rejected", raised)

        panel = q.set_major_changes(f.repo, "health", [{"text": "  "}, {"text": "real one"}])
        area = next(a for a in panel["areas"] if a["key"] == "health")
        check("blank-text rows are dropped rather than stored", len(area["major_changes"]) == 1)


def test_change_destination_versions_and_archives_history():
    with FreshDB() as f:
        import engine.quarterly as q
        q.set_field(f.repo, "appearance", "current_reality", "unfit, no routine")
        q.set_field(f.repo, "appearance", "destination", "run a 5k")
        q.set_achieved(f.repo, "appearance", True)
        q.set_field(f.repo, "appearance", "proof", "race finisher photo")
        panel = q.get_panel(f.repo)
        area = next(a for a in panel["areas"] if a["key"] == "appearance")
        check("proven before the goal changes", area["status"] == "proven")

        panel = q.change_destination(f.repo, "appearance", "run a 10k", reason="5k felt easy now", evidence="")
        area = next(a for a in panel["areas"] if a["key"] == "appearance")
        check("destination updates to the new goal", area["destination"] == "run a 10k")
        check("goal_version increments", area["goal_version"] == 2)
        check("old destination archived into goal_history", area["goal_history"][-1]["destination"] == "run a 5k")
        check("changing destination resets achieved", area["achieved"] is False)
        check("changing destination resets proof", area["proof"] == "")
        check("status drops back out of proven", area["status"] != "proven")

        try:
            q.change_destination(f.repo, "appearance", "", reason="x", evidence="")
            raised = False
        except ValueError:
            raised = True
        check("an empty new_destination is rejected", raised)


def test_reset_strategy_keeps_destination_clears_execution():
    with FreshDB() as f:
        import engine.quarterly as q
        q.set_field(f.repo, "mind", "current_reality", "no study habit")
        q.set_field(f.repo, "mind", "destination", "finish the certification")
        q.set_field(f.repo, "mind", "gap", "no scheduled time")
        q.set_major_changes(f.repo, "mind", [{"text": "block 6am-7am daily"}])
        q.set_field(f.repo, "mind", "weekly_lead_behavior", "5 study sessions a week")

        panel = q.reset_strategy(f.repo, "mind")
        area = next(a for a in panel["areas"] if a["key"] == "mind")
        check("destination survives a strategy reset", area["destination"] == "finish the certification")
        check("gap is cleared", area["gap"] == "")
        check("major_changes is cleared", area["major_changes"] == [])
        check("weekly_lead_behavior is cleared", area["weekly_lead_behavior"] == "")
        check("status drops back to defined", area["status"] == "defined")


def test_cycle_days_clamped():
    with FreshDB() as f:
        import engine.quarterly as q
        check("clamp below min falls back to min", q.clamp_cycle_days(1) == 7)
        check("clamp above max falls back to max", q.clamp_cycle_days(9999) == 365)
        check("clamp passes through a valid value", q.clamp_cycle_days(30) == 30)
        check("clamp handles garbage input with the 90 default", q.clamp_cycle_days("nonsense") == 90)


def test_set_cycle_moves_answers_to_new_key():
    with FreshDB() as f:
        import engine.quarterly as q
        q.set_field(f.repo, "health", "destination", "run 5k")
        old_key = q.cycle_key(f.repo)

        new_start = str(date.today() + timedelta(days=1))
        panel = q.set_cycle(f.repo, new_start, 45)
        check("cycle_start moves to the new anchor", panel["cycle_start"] == new_start)
        check("cycle_days updates", panel["cycle_days"] == 45)
        health = next(a for a in panel["areas"] if a["key"] == "health")
        check("answers carried over to the new cycle key", health["destination"] == "run 5k")

        old_answers = f.repo.list_answers(old_key)
        check("old cycle key has no leftover rows after the move", old_answers == [])


def test_set_cycle_does_not_overwrite_existing_destination_answers():
    with FreshDB() as f:
        import engine.quarterly as q
        from database.models import QuarterlyAnswer
        # Pre-seed an answer directly at the destination cycle key.
        dest_start = str(date.today() + timedelta(days=10))
        f.repo.add_answer(QuarterlyAnswer(cycle_start=dest_start, area="mind", destination="already here"))

        q.set_field(f.repo, "mind", "destination", "source cycle answer")
        q.set_cycle(f.repo, dest_start, 30)

        answer = f.repo.get_answer(dest_start, "mind")
        check("destination's existing answer wins over the moved source", answer.destination == "already here")


def test_cycle_progress_day_zero_for_future_start():
    with FreshDB() as f:
        import engine.quarterly as q
        future_start = str(date.today() + timedelta(days=5))
        q.set_cycle(f.repo, future_start, 30)
        day, total, left = q.cycle_progress(f.repo)
        check("a cycle that hasn't started yet reports day 0", day == 0)
        check("days_left accounts for the not-yet-started gap", left == total + 5)

        # The panel's quarter link renders "starts in Nd" from
        # days_left - cycle_days, matching legacy's own
        # `_qleft - _qtot`. Pinned here because it is a contract between
        # the engine and the UI: if days_left ever stopped including the
        # gap, the link would quietly show a wrong countdown rather than
        # fail.
        panel = q.get_panel(f.repo)
        check("the panel exposes the same day 0", panel["day"] == 0)
        check(
            "days_left - cycle_days is the days until the cycle starts",
            panel["days_left"] - panel["cycle_days"] == 5,
            f"got {panel['days_left'] - panel['cycle_days']}",
        )

        # And once running, days_left is used directly as "Nd left".
        q.set_cycle(f.repo, str(date.today()), 30)
        panel = q.get_panel(f.repo)
        check("a running cycle is on day 1", panel["day"] == 1)
        check("and reports 29 days left of 30", panel["days_left"] == 29, str(panel["days_left"]))


def test_invalid_cycle_start_string_rejected():
    with FreshDB() as f:
        import engine.quarterly as q
        try:
            q.set_cycle(f.repo, "not-a-date", 30)
            raised = False
        except ValueError:
            raised = True
        check("a non-ISO start date raises ValueError", raised)


def run_all():
    tests = [
        test_default_panel_falls_back_to_calendar_quarter,
        test_status_progression_through_the_7_steps,
        test_set_field_rejects_invalid_area_or_field,
        test_major_changes_capped_at_five_and_ids_assigned,
        test_change_destination_versions_and_archives_history,
        test_reset_strategy_keeps_destination_clears_execution,
        test_cycle_days_clamped,
        test_set_cycle_moves_answers_to_new_key,
        test_set_cycle_does_not_overwrite_existing_destination_answers,
        test_cycle_progress_day_zero_for_future_start,
        test_invalid_cycle_start_string_rejected,
    ]
    for t in tests:
        try:
            t()
        except Exception:
            FAILURES.append(t.__name__)
            print(f"[FAIL] {t.__name__} raised:")
            traceback.print_exc()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILURE(S): {FAILURES}")
    else:
        print("ALL PASS")
    return len(FAILURES) == 0


if __name__ == "__main__":
    ok = run_all()
    raise SystemExit(0 if ok else 1)
