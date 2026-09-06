"""Idempotent regression test for the strike feature (max-3 cap,
Focus-only, auto-stop-timer-on-unstrike, daily reset). No pytest
dependency — plain asserts, run directly:

    .venv/bin/python test_strike.py

Every test gets its own fresh temp SQLite DB (STRIKE_MAX is a global
cap, so tests sharing one DB would trip each other's limits) and each
is deleted immediately after use — never touches the real app.db.
"""

import os
import tempfile
import time
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
    """Builds a brand-new temp SQLite DB + runs migrations before the
    test body, tears it down after — reimports the app modules each time
    since database.connection reads APP_DB_PATH once at import time."""

    def __enter__(self):
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        os.environ["APP_DB_PATH"] = self.path

        import importlib
        import database.connection as connection
        importlib.reload(connection)

        cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
        command.upgrade(cfg, "head")

        from database.repository import ProjectRepository, TaskRepository
        from engine.tasks import TaskEngine

        self.db = connection.SessionLocal()
        self.engine = TaskEngine(TaskRepository(self.db), ProjectRepository(self.db))
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


def test_basic_toggle_and_max():
    with FreshDB() as f:
        ids = [f.engine.create_task(f"focus task {i}", "focus").id for i in range(4)]
        f.db.commit()

        for tid in ids[:3]:
            t = f.engine.toggle_strike(tid)
            check(f"strike on for task {tid}", t.strike is True)
        f.db.commit()

        from engine.tasks import StrikeLimitReached
        try:
            f.engine.toggle_strike(ids[3])
            hit_limit = False
        except StrikeLimitReached:
            hit_limit = True
        check("4th strike is rejected with StrikeLimitReached", hit_limit)

        from engine.tasks import STRIKE_MAX
        struck = f.engine.list_strike_tasks()
        check("exactly 3 struck tasks visible", len(struck) == STRIKE_MAX, f"got {len(struck)}")

        f.engine.toggle_strike(ids[0])  # free a slot
        f.db.commit()
        t3 = f.engine.toggle_strike(ids[3])
        check("un-striking one frees a slot for a new one", t3 is not None and t3.strike is True)


def test_plan_task_rejected():
    with FreshDB() as f:
        plan_task = f.engine.create_task("a plan task", "classic")
        f.db.commit()
        result = f.engine.toggle_strike(plan_task.id)
        check("striking a Plan-list task is rejected (returns None)", result is None)


def test_unstrike_stops_running_timer():
    with FreshDB() as f:
        t = f.engine.create_task("timed focus task", "focus")
        f.db.commit()
        f.engine.toggle_strike(t.id)
        f.engine.toggle_timer(t.id)  # start its own timer
        f.db.commit()

        running = f.engine.get_task(t.id)
        check("timer is running before un-strike", running.sessions[-1]["end"] is None)

        time.sleep(0.2)
        f.engine.toggle_strike(t.id)  # un-strike while running
        f.db.commit()

        stopped = f.engine.get_task(t.id)
        check("un-strike stopped the running timer", stopped.sessions[-1]["end"] is not None)
        check("un-strike credited some elapsed time", stopped.secs > 0)
        check("strike is now False", stopped.strike is False)


def test_nonexistent_task():
    with FreshDB() as f:
        result = f.engine.toggle_strike(999999999)
        check("toggling a nonexistent task id returns None", result is None)


def test_daily_reset():
    with FreshDB() as f:
        t1 = f.engine.create_task("yesterday's pick 1", "focus")
        t2 = f.engine.create_task("yesterday's pick 2", "focus")
        f.db.commit()
        f.engine.toggle_strike(t1.id)
        f.engine.toggle_strike(t2.id)
        f.db.commit()

        state = f.engine.repo.get_app_state()
        state.last_strike_reset_day = str(date.today() - timedelta(days=1))
        f.engine.repo.save_app_state(state)
        f.db.commit()

        struck_before_check = [t.strike for t in [f.engine.get_task(t1.id), f.engine.get_task(t2.id)]]
        check("strikes still True until the reset check runs", all(struck_before_check))

        struck_today = f.engine.list_strike_tasks()  # triggers the lazy reset
        f.db.commit()
        check("daily reset cleared all of yesterday's strikes", len(struck_today) == 0)

        reloaded = [f.engine.get_task(t1.id), f.engine.get_task(t2.id)]
        check("both tasks individually show strike=False after reset", all(not t.strike for t in reloaded))

        fresh = f.engine.toggle_strike(t1.id)
        check("striking again after reset works (slot freed)", fresh is not None and fresh.strike is True)


def test_project_key_attribution():
    with FreshDB() as f:
        t = f.engine.create_task("from a project card", "focus")
        f.db.commit()
        updated = f.engine.toggle_strike(t.id, project_key="proj2")
        check("project_key gets attributed on strike", updated.project == "proj2")


def run_all():
    tests = [
        test_basic_toggle_and_max,
        test_plan_task_rejected,
        test_unstrike_stops_running_timer,
        test_nonexistent_task,
        test_daily_reset,
        test_project_key_attribution,
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
