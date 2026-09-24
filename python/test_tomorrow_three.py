"""Tomorrow's three and the daily three history (engine/tasks.py).

    python python/test_tomorrow_three.py

Fresh temp SQLite per test. What matters: picking is limited to three
open Focus tasks; at the day rollover the picks become that day's
strike list (and stale picks are dropped); the day that is ending is
recorded as [done, total] before its flags are cleared; the week view
reads history for past days and today live.
"""

import os
import tempfile
import traceback
from datetime import date, timedelta

from alembic import command
from alembic.config import Config

FAILURES = []


def check(label, cond, detail=""):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" — {detail}" if detail and not cond else ""))
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
        command.upgrade(Config(os.path.join(os.path.dirname(__file__), "alembic.ini")), "head")
        from database.repository import ProjectRepository, TaskRepository
        from engine.tasks import TaskEngine
        self.db = connection.SessionLocal()
        self.repo = TaskRepository(self.db)
        self.engine = TaskEngine(self.repo, ProjectRepository(self.db))
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)

    def task(self, text):
        import time
        time.sleep(0.002)  # task ids are ms timestamps
        return self.engine.create_task(text, "focus")


TODAY = str(date.today())
YESTERDAY = str(date.today() - timedelta(days=1))


def test_pick_limits():
    with FreshDB() as f:
        from engine.tasks import StrikeLimitReached, get_tomorrow_three, set_tomorrow_three
        ts = [f.task(f"t{i}") for i in range(4)]
        picked = set_tomorrow_three(f.repo, [ts[0].id, ts[1].id])
        check("two picks stored", [t.id for t in picked] == [ts[0].id, ts[1].id])
        try:
            set_tomorrow_three(f.repo, [t.id for t in ts])
            check("a fourth pick is refused", False)
        except StrikeLimitReached:
            check("a fourth pick is refused", True)
        f.engine.toggle_done(ts[2].id)
        try:
            set_tomorrow_three(f.repo, [ts[2].id])
            check("a done task can't be picked", False)
        except ValueError:
            check("a done task can't be picked", True)
        check("reading back", len(get_tomorrow_three(f.repo)) == 2)
        check("clearing works", set_tomorrow_three(f.repo, []) == [])


def test_rollover_applies_picks_and_records_history():
    with FreshDB() as f:
        from engine.tasks import reset_strike_if_new_day
        a, b, c, d = (f.task(x) for x in "abcd")
        # yesterday's three: a done, b not
        f.engine.toggle_strike(a.id)
        f.engine.toggle_strike(b.id)
        f.engine.toggle_done(a.id)
        state = f.repo.get_app_state()
        state.last_strike_reset_day = YESTERDAY
        state.tomorrow_three = {"day": TODAY, "ids": [b.id, c.id, a.id]}  # a is done -> skipped
        f.repo.save_app_state(state)
        reset_strike_if_new_day(f.repo)
        struck = {t.id for t in f.repo.list_struck()}
        check("picks become today's three", struck == {b.id, c.id}, str(struck))
        state = f.repo.get_app_state()
        check("yesterday recorded as [done, total]", state.three_history.get(YESTERDAY) == [1, 2], str(state.three_history))
        check("pending picks cleared once applied", "day" not in state.tomorrow_three)
        from engine.tasks import picked_last_night
        check("applied picks remembered for today", sorted(picked_last_night(f.repo)) == sorted([b.id, c.id]))


def test_stale_picks_dropped():
    with FreshDB() as f:
        from engine.tasks import reset_strike_if_new_day
        a = f.task("a")
        state = f.repo.get_app_state()
        state.last_strike_reset_day = str(date.today() - timedelta(days=3))
        state.tomorrow_three = {"day": str(date.today() - timedelta(days=2)), "ids": [a.id]}
        f.repo.save_app_state(state)
        reset_strike_if_new_day(f.repo)
        check("stale picks not applied", not f.repo.list_struck())
        check("stale picks cleared", f.repo.get_app_state().tomorrow_three == {})


def test_week_view():
    with FreshDB() as f:
        from engine.tasks import reset_strike_if_new_day, three_week
        reset_strike_if_new_day(f.repo)
        a, b = f.task("a"), f.task("b")
        f.engine.toggle_strike(a.id)
        f.engine.toggle_strike(b.id)
        f.engine.toggle_done(a.id)
        state = f.repo.get_app_state()
        state.three_history = {YESTERDAY: [3, 3]}
        f.repo.save_app_state(state)
        week = three_week(f.repo)
        check("seven days, Monday first", len(week) == 7 and date.fromisoformat(week[0]["day"]).weekday() == 0)
        today = [d for d in week if d["day"] == TODAY][0]
        check("today is live", (today["done"], today["total"]) == (1, 2), str(today))
        y = [d for d in week if d["day"] == YESTERDAY]
        if y:
            check("yesterday from history", (y[0]["done"], y[0]["total"]) == (3, 3), str(y[0]))
        check("future days flagged", all(d["future"] for d in week if d["day"] > TODAY))


def test_setting_round_trips():
    with FreshDB() as f:
        from engine.settings import get_settings, update_settings
        check("adaptive plan on by default", get_settings(f.repo)["plan_adaptive"] is True)
        check("can switch it off", update_settings(f.repo, plan_adaptive=False)["plan_adaptive"] is False)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
            except Exception:
                traceback.print_exc()
                FAILURES.append(name)
    print()
    print("ALL PASS" if not FAILURES else f"{len(FAILURES)} FAILED: {FAILURES}")
    raise SystemExit(1 if FAILURES else 0)
