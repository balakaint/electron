"""Idempotent regression test for the 90-Day Quarterly Plan. No pytest
dependency:

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
        check("fresh panel has 0/6 areas done", panel["areas_done"] == 0 and panel["areas_total"] == 6)


def test_set_answer_updates_done_count_only_on_out():
    with FreshDB() as f:
        import engine.quarterly as q
        p1 = q.set_answer(f.repo, "money", "act", "save weekly")
        check("setting 'act' alone does not count as done", p1["areas_done"] == 0)
        p2 = q.set_answer(f.repo, "money", "out", "72kg")
        check("setting 'out' counts as done", p2["areas_done"] == 1)
        money = next(a for a in p2["areas"] if a["key"] == "money")
        check("both fields persisted on the same area", money["act"] == "save weekly" and money["out"] == "72kg")


def test_set_answer_rejects_invalid_area_or_field():
    with FreshDB() as f:
        import engine.quarterly as q
        try:
            q.set_answer(f.repo, "not-a-real-area", "out", "x")
            raised = False
        except ValueError:
            raised = True
        check("invalid area raises ValueError", raised)

        try:
            q.set_answer(f.repo, "money", "not-a-real-field", "x")
            raised = False
        except ValueError:
            raised = True
        check("invalid field raises ValueError", raised)


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
        q.set_answer(f.repo, "health", "out", "run 5k")
        old_key = q.cycle_key(f.repo)

        new_start = str(date.today() + timedelta(days=1))
        panel = q.set_cycle(f.repo, new_start, 45)
        check("cycle_start moves to the new anchor", panel["cycle_start"] == new_start)
        check("cycle_days updates", panel["cycle_days"] == 45)
        health = next(a for a in panel["areas"] if a["key"] == "health")
        check("answers carried over to the new cycle key", health["out"] == "run 5k")

        old_answers = f.repo.list_answers(old_key)
        check("old cycle key has no leftover rows after the move", old_answers == [])


def test_set_cycle_does_not_overwrite_existing_destination_answers():
    with FreshDB() as f:
        import engine.quarterly as q
        from database.models import QuarterlyAnswer
        # Pre-seed an answer directly at the destination cycle key.
        dest_start = str(date.today() + timedelta(days=10))
        f.repo.add_answer(QuarterlyAnswer(cycle_start=dest_start, area="mind", out="already here"))

        q.set_answer(f.repo, "mind", "out", "source cycle answer")
        q.set_cycle(f.repo, dest_start, 30)

        answer = f.repo.get_answer(dest_start, "mind")
        check("destination's existing answer wins over the moved source", answer.out == "already here")


def test_cycle_progress_day_zero_for_future_start():
    with FreshDB() as f:
        import engine.quarterly as q
        future_start = str(date.today() + timedelta(days=5))
        q.set_cycle(f.repo, future_start, 30)
        day, total, left = q.cycle_progress(f.repo)
        check("a cycle that hasn't started yet reports day 0", day == 0)
        check("days_left accounts for the not-yet-started gap", left == total + 5)


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
        test_set_answer_updates_done_count_only_on_out,
        test_set_answer_rejects_invalid_area_or_field,
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
