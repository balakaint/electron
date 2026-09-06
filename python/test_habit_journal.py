"""Idempotent regression test for the Habits dashboard's per-day
journal fields (win, reflection) and the monthly report. No pytest
dependency:

    .venv/bin/python test_habit_journal.py

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

        from database.repository import HabitRepository
        from engine.habits import HabitEngine

        self.db = connection.SessionLocal()
        self.repo = HabitRepository(self.db)
        self.engine = HabitEngine(self.repo)
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


TODAY = str(date.today())


def d(days_ago: int) -> str:
    return str(date.today() - timedelta(days=days_ago))


def test_win_and_reflection_are_independent_of_intention():
    with FreshDB() as f:
        check("win starts empty", f.engine.get_win(TODAY) == "")
        check("reflection starts empty", f.engine.get_reflection(TODAY) == "")
        check("intention starts empty", f.engine.get_intention(TODAY) == "")

        f.engine.set_win(TODAY, "Shipped the release")
        check("setting win doesn't touch intention", f.engine.get_intention(TODAY) == "")
        check("setting win doesn't touch reflection", f.engine.get_reflection(TODAY) == "")
        check("win persists", f.engine.get_win(TODAY) == "Shipped the release")

        f.engine.set_reflection(TODAY, "Good focus in the morning")
        check("reflection persists independently", f.engine.get_reflection(TODAY) == "Good focus in the morning")
        check("win survives a later reflection write to the same row", f.engine.get_win(TODAY) == "Shipped the release")

        f.engine.set_intention(TODAY, "Ship the release")
        check("intention still independent after win+reflection exist", f.engine.get_intention(TODAY) == "Ship the release")
        check("win untouched by the intention write", f.engine.get_win(TODAY) == "Shipped the release")


def test_monthly_report_no_activity():
    with FreshDB() as f:
        report = f.engine.monthly_report()
        check("no habits logged this month means days_done 0", report["days_done"] == 0)
        check("avg_score is 0 with no data", report["avg_score"] == 0)


def test_monthly_report_counts_days_used_not_days_perfect():
    with FreshDB() as f:
        h1 = f.engine.create_habit("health", "Walk")
        # _day_counts weighs against ALL active habits (seed data included,
        # matching legacy's own "today's active set applied uniformly to
        # every day checked") — so expected scores are derived from the
        # real total rather than assumed to be just the ones created here.
        _, total = f.engine._day_counts(TODAY)

        f.engine.toggle_completion(h1.id, TODAY)
        f.engine.toggle_completion(h1.id, d(1))
        done_today, _ = f.engine._day_counts(TODAY)
        done_yesterday, _ = f.engine._day_counts(d(1))

        report = f.engine.monthly_report()
        check("days_done counts every day with a completion row, not just perfect ones", report["days_done"] == 2)
        expected_avg = int((int(done_today / total * 100) + int(done_yesterday / total * 100)) / 2)
        check("avg_score averages this month's daily scores", report["avg_score"] == expected_avg)
        check("streak is included in the same report", report["streak"] == f.engine.streak())


def run_all():
    tests = [
        test_win_and_reflection_are_independent_of_intention,
        test_monthly_report_no_activity,
        test_monthly_report_counts_days_used_not_days_perfect,
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
        raise SystemExit(1)
    print("ALL PASS")


if __name__ == "__main__":
    run_all()
