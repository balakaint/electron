"""Idempotent regression test for the TODAY/TOMORROW day-view feature
(global toggle, day<=today vs day>today filtering, new-task day
defaulting, strike interaction). No pytest dependency — plain asserts:

    .venv/bin/python test_day_view.py

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

        from database.repository import ProjectRepository, TaskRepository
        from engine.tasks import TaskEngine

        self.db = connection.SessionLocal()
        self.engine = TaskEngine(TaskRepository(self.db), ProjectRepository(self.db))
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


TODAY = str(date.today())
TOMORROW = str(date.today() + timedelta(days=1))
YESTERDAY = str(date.today() - timedelta(days=1))


def test_default_view_is_today():
    with FreshDB() as f:
        check("default day-view is 'today'", f.engine.get_day_view() == "today")


def test_today_view_includes_overdue():
    with FreshDB() as f:
        overdue = f.engine.create_task("overdue plan item", "classic", day=YESTERDAY)
        today_task = f.engine.create_task("today plan item", "classic", day=TODAY)
        future = f.engine.create_task("future plan item", "classic", day=TOMORROW)
        f.db.commit()

        visible = {t.id for t in f.engine.list_tasks("classic")}
        check("today view includes an overdue (yesterday) task", overdue.id in visible)
        check("today view includes today's task", today_task.id in visible)
        check("today view excludes a future (tomorrow) task", future.id not in visible)


def test_tomorrow_view_is_exhaustive_complement():
    with FreshDB() as f:
        overdue = f.engine.create_task("overdue", "classic", day=YESTERDAY)
        today_task = f.engine.create_task("today", "classic", day=TODAY)
        future = f.engine.create_task("future", "classic", day=TOMORROW)
        f.db.commit()

        f.engine.set_day_view("tomorrow")
        visible = {t.id for t in f.engine.list_tasks("classic")}
        check("tomorrow view excludes overdue", overdue.id not in visible)
        check("tomorrow view excludes today's task", today_task.id not in visible)
        check("tomorrow view includes the future task", future.id in visible)


def test_view_is_global_across_lists():
    with FreshDB() as f:
        focus_future = f.engine.create_task("focus future", "focus", day=TOMORROW)
        f.db.commit()

        # Switching the view has no per-list scoping — it's one toggle.
        before = {t.id for t in f.engine.list_tasks("focus")}
        check("future focus task hidden under default 'today' view", focus_future.id not in before)

        f.engine.set_day_view("tomorrow")
        after = {t.id for t in f.engine.list_tasks("focus")}
        check("same global toggle also affects the Focus list", focus_future.id in after)


def test_new_task_defaults_to_current_view_date():
    with FreshDB() as f:
        t_today = f.engine.create_task("plan while in today view", "classic")
        f.db.commit()
        check("task created in 'today' view gets today's date", t_today.day == TODAY)

        f.engine.set_day_view("tomorrow")
        t_tomorrow = f.engine.create_task("plan while in tomorrow view", "classic")
        f.db.commit()
        check("task created in 'tomorrow' view gets tomorrow's date", t_tomorrow.day == TOMORROW)

        # Explicit day param still overrides the view-derived default.
        t_explicit = f.engine.create_task("explicit day", "classic", day=YESTERDAY)
        f.db.commit()
        check("an explicit day param overrides the view default", t_explicit.day == YESTERDAY)


def test_strike_respects_day_view():
    with FreshDB() as f:
        future_focus = f.engine.create_task("future focus", "focus", day=TOMORROW)
        f.db.commit()

        # Can't strike it while it's not in view (today view, future task).
        from engine.tasks import StrikeLimitReached
        result = f.engine.toggle_strike(future_focus.id)
        # It's not rejected by list_key (it IS focus) — it just won't
        # show up in _struck_in_view for counting, but toggling itself
        # isn't blocked by the view; only the 3-cap check depends on it.
        check("striking a not-currently-in-view task still sets the flag", result is not None and result.strike)

        struck_today_view = f.engine.list_strike_tasks()
        check(
            "but it doesn't show in today's strike list since its day doesn't match",
            future_focus.id not in {t.id for t in struck_today_view},
        )

        f.engine.set_day_view("tomorrow")
        struck_tomorrow_view = f.engine.list_strike_tasks()
        check(
            "switching to tomorrow view surfaces it in the strike list",
            future_focus.id in {t.id for t in struck_tomorrow_view},
        )


def test_invalid_view_rejected():
    with FreshDB() as f:
        try:
            f.engine.set_day_view("yesterday")
            raised = False
        except ValueError:
            raised = True
        check("setting an invalid view raises ValueError", raised)


def test_set_day_moves_task_between_views():
    """set_day (backing the "→ Today" button) just flips `day` — matches
    legacy's _send_to_today, which never copies/moves a task between
    separate collections since Today/Tomorrow are one filtered list."""
    with FreshDB() as f:
        t = f.engine.create_task("plan ahead", "classic", day=TOMORROW)
        check("task created for tomorrow starts out of the today view", t.day == TOMORROW)

        moved = f.engine.set_day(t.id, TODAY)
        check("set_day updates the stored day", moved.day == TODAY)

        f.engine.set_day_view("today")
        check("task now shows up in the today view", any(x.id == t.id for x in f.engine.list_tasks()))

        check("setting an unknown task id returns None", f.engine.set_day(999999999, TODAY) is None)


def test_move_task_reorders_within_done_group():
    """move_task (the button-driven stand-in for legacy's drag-to-reorder)
    swaps sort_order with the adjacent task in the same done-state and
    day-view group — matches legacy's clamp that a drag can never cross
    the done/not-done boundary, since _render_tasks always sorts
    unfinished tasks above finished ones."""
    with FreshDB() as f:
        a = f.engine.create_task("first", "classic", day=TODAY)
        b = f.engine.create_task("second", "classic", day=TODAY)
        c = f.engine.create_task("third", "classic", day=TODAY)
        check("tasks list in creation order", [t.id for t in f.engine.list_tasks("classic")] == [a.id, b.id, c.id])

        f.engine.move_task(b.id, -1)
        check("moving b up swaps it with a", [t.id for t in f.engine.list_tasks("classic")] == [b.id, a.id, c.id])

        f.engine.move_task(b.id, -1)
        check("moving b up again is a no-op at the top", [t.id for t in f.engine.list_tasks("classic")] == [b.id, a.id, c.id])

        f.engine.toggle_done(c.id)
        result = f.engine.move_task(c.id, -1)
        check(
            "a done task can't be moved above an undone one",
            [t.id for t in f.engine.list_tasks("classic")] == [b.id, a.id, c.id],
        )
        check("move_task returns the current view", [t.id for t in result] == [b.id, a.id, c.id])

        check("moving an unknown task id returns None", f.engine.move_task(999999999, -1) is None)


def run_all():
    tests = [
        test_default_view_is_today,
        test_today_view_includes_overdue,
        test_tomorrow_view_is_exhaustive_complement,
        test_view_is_global_across_lists,
        test_new_task_defaults_to_current_view_date,
        test_strike_respects_day_view,
        test_invalid_view_rejected,
        test_set_day_moves_task_between_views,
        test_move_task_reorders_within_done_group,
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
