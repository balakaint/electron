"""TASK LIST's "all" view and done_at (engine/tasks.py).

    python python/test_task_list_all.py

Fresh temp SQLite per test. What matters: "all" returns every open task
whatever its day, plus tasks finished in the last 7 days (by done_at,
falling back to day for tasks finished before done_at existed); an
explicit "today"/"tomorrow" view no longer depends on the global
toggle; done_at is set on done and cleared on undo.
"""

import os
import tempfile
import time
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


def d(n):
    return str(date.today() + timedelta(days=n))


def add(f, text, day):
    time.sleep(0.002)  # ids are ms timestamps
    return f.engine.create_task(text, "focus", day)


def names(tasks):
    return sorted(t.text for t in tasks)


def test_all_view():
    with FreshDB() as f:
        add(f, "overdue", d(-3))
        add(f, "today", d(0))
        add(f, "tomorrow", d(1))
        add(f, "next week", d(7))
        recent = add(f, "done today", d(0))
        f.engine.toggle_done(recent.id)
        old = add(f, "done long ago", d(-20))
        f.engine.toggle_done(old.id)
        # Simulate a task finished 20 days ago.
        o = f.repo.get(old.id)
        o.done_at = d(-20)
        f.repo.save(o)
        legacy = add(f, "legacy done", d(-2))
        f.engine.toggle_done(legacy.id)
        g = f.repo.get(legacy.id)
        g.done_at = None  # finished before done_at existed
        f.repo.save(g)
        got = names(f.engine.list_tasks("focus", "all"))
        check("all = open tasks of any day + done in last 7 days",
              got == sorted(["overdue", "today", "tomorrow", "next week", "done today", "legacy done"]), str(got))
        check("explicit today view", names(f.engine.list_tasks("focus", "today")) ==
              sorted(["overdue", "today", "done today", "done long ago", "legacy done"]))
        check("explicit tomorrow view", names(f.engine.list_tasks("focus", "tomorrow")) == ["next week", "tomorrow"])
        f.engine.set_day_view("tomorrow")
        check("explicit view ignores the global toggle", "today" in names(f.engine.list_tasks("focus", "today")))
        check("no view still follows the global toggle", names(f.engine.list_tasks("focus")) == ["next week", "tomorrow"])


def test_done_at():
    with FreshDB() as f:
        t = add(f, "x", d(0))
        t = f.engine.toggle_done(t.id)
        check("done sets done_at to today", t.done_at == d(0), str(t.done_at))
        t = f.engine.toggle_done(t.id)
        check("undone clears done_at", t.done_at is None)


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
