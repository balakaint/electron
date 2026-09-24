"""Idempotent regression test for the daily journal notes that survive
on DailyIntention: Mindset (with its 7-day history) and Design Today,
both on engine/mindset.py's MindsetEngine. No pytest dependency:

    .venv/bin/python test_habit_journal.py

Every test gets its own fresh temp SQLite DB, deleted immediately after
— never touches the real app.db.

History: this file used to test HabitEngine's Win / Reflection /
Intention notes and monthly habit report. Those features were removed
on purpose on 2026-09-14 (see engine/mindset.py's header and
DailyIntention's docstring), and HabitEngine with them, so those tests
went too. Only the Mindset tests carried over, now pointed at
MindsetEngine.
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

        from database.repository import MindsetRepository
        from engine.mindset import MindsetEngine

        self.db = connection.SessionLocal()
        self.repo = MindsetRepository(self.db)
        self.engine = MindsetEngine(self.repo)
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


TODAY = str(date.today())


def d(days_ago: int) -> str:
    return str(date.today() - timedelta(days=days_ago))


def test_mindset_and_design_today_are_independent():
    with FreshDB() as f:
        e = f.engine
        check("mindset starts empty", e.get_mindset(TODAY) == "")
        check("design today starts empty", e.get_design_today(TODAY) == "")

        e.set_design_today(TODAY, "deep work 9-12, calls after lunch")
        e.set_mindset(TODAY, "one thing at a time")

        check("mindset stored", e.get_mindset(TODAY) == "one thing at a time")
        # Both live on the same DailyIntention row; writing one must not
        # overwrite the other.
        check("mindset did not overwrite design today",
              e.get_design_today(TODAY) == "deep work 9-12, calls after lunch", e.get_design_today(TODAY))
        e.set_design_today(TODAY, "changed plan")
        check("design today did not overwrite mindset", e.get_mindset(TODAY) == "one thing at a time")
        check("an unwritten day's mindset is empty", e.get_mindset(d(3)) == "")


def test_mindset_history_window_and_gaps():
    with FreshDB() as f:
        e = f.engine
        e.set_mindset(TODAY, "today's note")
        e.set_mindset(d(1), "yesterday")
        e.set_mindset(d(3), "three days ago")
        e.set_mindset(d(6), "six days ago")
        e.set_mindset(d(9), "outside the window")
        e.set_mindset(d(2), "   ")          # whitespace only

        hist = e.mindset_history(7)
        days = [h["day"] for h in hist]

        check("history excludes today (it is in the editor above)",
              TODAY not in days, str(days))
        check("history is newest first", days == [d(1), d(3), d(6)], str(days))
        check("history skips days with nothing written", d(2) not in days, str(days))
        check("history skips whitespace-only notes", d(2) not in days)
        check("history respects the window", d(9) not in days, str(days))
        check("history carries the text", hist[0]["text"] == "yesterday")
        check("history carries a display label", bool(hist[0]["label"]))

        check("an empty store gives an empty history",
              e.mindset_history(7) is not None)


def test_mindset_history_all_empty():
    with FreshDB() as f:
        check("no notes at all yields []", f.engine.mindset_history(7) == [])


def run_all():
    tests = [
        test_mindset_and_design_today_are_independent,
        test_mindset_history_window_and_gaps,
        test_mindset_history_all_empty,
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
