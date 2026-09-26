"""Today's deep work curve (ProjectSpan, engine/projects.deep_work_curve).

    python python/test_deep_work_curve.py

Fresh temp SQLite. What matters: every credited stretch is kept with its
real times, a steady run is one span (checkpoint ticks join onto it),
idle time the timer refunds never shows up, the spans add up to the
day's real total, and a running timer's uncredited stretch is reported.
"""

import os
import tempfile
import time
import traceback
from datetime import date

from alembic import command
from alembic.config import Config

FAILURES = []


def check(label, cond, detail=""):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(label)


def test_curve():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["APP_DB_PATH"] = path
    import importlib
    import database.connection as connection
    importlib.reload(connection)
    command.upgrade(Config(os.path.join(os.path.dirname(__file__), "alembic.ini")), "head")
    from database.repository import ProjectRepository
    from engine.projects import ProjectEngine
    from engine.timer_reconciliation import start_project, stop_project, tick_project

    db = connection.SessionLocal()
    repo = ProjectRepository(db)
    eng = ProjectEngine(repo)
    eng.update_project("proj1", name="Work")
    p = repo.get("proj1")
    base = time.mktime(date.today().timetuple()) + 9 * 3600  # 9:00 today
    idle = 15 * 60

    # A steady 10 minutes with checkpoint ticks every minute -> one span.
    start_project(repo, p, now=base, idle_limit_secs=idle)
    for m in range(1, 10):
        tick_project(repo, p, now=base + m * 60, idle_limit_secs=idle)
    stop_project(repo, p, now=base + 600, idle_limit_secs=idle)
    repo.save(p)
    c = eng.deep_work_curve(now=base + 700)
    check("a steady run is one span", len(c["spans"]) == 1, str(c["spans"]))
    check("it keeps the real start and end", c["spans"] and c["spans"][0] == {"start": base, "end": base + 600}, str(c["spans"]))

    # Left running an hour: only the idle limit is credited, and logged.
    start_project(repo, p, now=base + 3600, idle_limit_secs=idle)
    stop_project(repo, p, now=base + 7200, idle_limit_secs=idle)
    repo.save(p)
    c = eng.deep_work_curve(now=base + 7300)
    check("a second session is its own span", len(c["spans"]) == 2, str(c["spans"]))
    check("refunded idle time is not in it", c["spans"][1]["end"] - c["spans"][1]["start"] == idle, str(c["spans"][1]))
    total = sum(s["end"] - s["start"] for s in c["spans"])
    check("spans add up to the day's total", abs(total - c["total_secs"]) < 1e-6, f"{total} vs {c['total_secs']}")
    want = sum(x.target_minutes * 60 for x in eng.named_projects())
    check("goal comes from the named projects' targets", c["goal_secs"] == want, f"{c['goal_secs']} vs {want}")
    check("nothing running reports no live span", c["running"] is None)

    # Running now: its uncredited stretch is reported, capped at idle.
    start_project(repo, p, now=base + 9000, idle_limit_secs=idle)
    repo.save(p)
    c = eng.deep_work_curve(now=base + 9300)
    check("a running timer shows its live stretch", c["running"] == {"start": base + 9000, "end": base + 9300}, str(c["running"]))
    c = eng.deep_work_curve(now=base + 9000 + 3 * idle)
    check("the live stretch is capped at the idle limit", c["running"]["end"] - c["running"]["start"] == idle, str(c["running"]))

    # Unnamed projects are not deep work.
    eng.update_project("proj2", name="")
    q = repo.get("proj2")
    start_project(repo, q, now=base + 20000, idle_limit_secs=idle)
    stop_project(repo, q, now=base + 20300, idle_limit_secs=idle)
    repo.save(q)
    c = eng.deep_work_curve(now=base + 20400)
    check("unnamed projects are left out", all(s["start"] < base + 20000 for s in c["spans"]), str(c["spans"]))
    db.close()


if __name__ == "__main__":
    try:
        test_curve()
    except Exception:
        traceback.print_exc()
        FAILURES.append("test_curve")
    print(f"\n{'ALL PASS' if not FAILURES else f'{len(FAILURES)} FAILED: {FAILURES}'}")
    raise SystemExit(1 if FAILURES else 0)
