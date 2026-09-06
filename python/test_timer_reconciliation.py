"""Idempotent regression test for the timer-reconciliation fix (day-split
crediting, idle cap+refund, project-timer exclusivity, and the
subtask-delete FK unlink). No pytest dependency — plain asserts, run
directly:

    .venv/bin/python test_timer_reconciliation.py

Always builds a fresh temp SQLite DB and deletes it afterward (including
on failure), so re-running never depends on or corrupts prior state —
and never touches the real app.db.
"""

import os
import tempfile
import time
import traceback
from datetime import date, datetime, timedelta

fd, DB_PATH = tempfile.mkstemp(suffix=".db")
os.close(fd)
os.environ["APP_DB_PATH"] = DB_PATH

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
command.upgrade(cfg, "head")

from database.connection import SessionLocal  # noqa: E402
from database.models import Project, ProjectSubtask, Task  # noqa: E402
from database.repository import ProjectRepository, TaskRepository  # noqa: E402
from engine.projects import ProjectEngine  # noqa: E402
from engine.tasks import TaskEngine  # noqa: E402
from engine.timer_reconciliation import (  # noqa: E402
    IDLE_LIMIT_SECS,
    reconcile_all_projects,
    reconcile_all_tasks,
)

FAILURES = []


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(label)


def fresh_db():
    return SessionLocal()


# ── 1. Idle cap + refund on explicit stop (simulated crash: running_since far in the past) ──
def test_idle_cap_on_stop():
    db = fresh_db()
    repo = ProjectRepository(db)
    engine = ProjectEngine(repo)
    p = repo.get("proj1")
    stale_start = time.time() - 5000  # ~83 minutes "ago" — simulates a crash
    p.running_since = stale_start
    repo.save(p)

    engine.toggle_timer("proj1")  # stop

    p = repo.get("proj1")
    # Reads whichever calendar day the credited span actually landed on
    # rather than assuming "today" — a stale start this close to
    # midnight can (correctly, matching the day-split behavior tested
    # below) land its credit on the PREVIOUS day if this test itself
    # happens to run in the ~90 minutes after midnight.
    credit_day = str(datetime.fromtimestamp(stale_start).date())
    activity = repo.get_activity("proj1", credit_day)
    credited_secs = activity.secs if activity is not None else 0.0
    check(
        "idle cap: stop after a stale running_since credits only IDLE_LIMIT_SECS",
        abs(credited_secs - IDLE_LIMIT_SECS) < 2,
        f"got {credited_secs}s, expected ~{IDLE_LIMIT_SECS}s",
    )
    check("idle cap: running_since cleared after stop", p.running_since is None)
    db.close()


# ── 2. Healthy ticks before a crash are preserved, only the final gap is capped ──
def test_ticks_preserved_before_crash():
    db = fresh_db()
    repo = ProjectRepository(db)
    p = repo.get("proj2")
    t0 = time.time() - 10 * 60  # started 10 min ago
    p.running_since = t0
    repo.save(p)
    db.close()

    # Three healthy 1-minute reconciliation ticks (engine alive, scheduler running)
    for i in range(1, 4):
        db = fresh_db()
        repo = ProjectRepository(db)
        p = repo.get("proj2")
        reconcile_all_projects(repo)  # ticks whatever is running
        db.commit()
        db.close()

    # Now simulate the engine going down hard for a long stretch, then restarting.
    db = fresh_db()
    repo = ProjectRepository(db)
    p = repo.get("proj2")
    p.running_since -= 4000  # push the checkpoint far into the past: simulate downtime
    repo.save(p)
    db.close()

    db = fresh_db()
    repo = ProjectRepository(db)
    reconcile_all_projects(repo)  # engine-startup reconciliation
    db.commit()
    engine = ProjectEngine(repo)
    # Summed over today AND yesterday rather than just secs_today(): the
    # simulated window here spans over an hour, so if this test happens
    # to run in the hour or so after midnight, the pre-crash ticks and
    # the crash tail can legitimately land on different calendar days
    # (correct day-split behavior, exercised deliberately below) — a
    # today-only read would then undercount through no fault of the
    # reconciliation logic itself.
    yesterday = str(date.today() - timedelta(days=1))
    prev_day_activity = repo.get_activity("proj2", yesterday)
    total = engine.secs_today("proj2") + (prev_day_activity.secs if prev_day_activity else 0.0)
    db.close()

    # Expect: the healthy pre-crash ticks credited real elapsed (small, since
    # ticks were seconds apart in this test) PLUS the idle-capped crash tail —
    # not a naive "everything since original start capped at 15 min" (which
    # would wrongly discard the legitimately-ticked time).
    check(
        "pre-crash ticks + capped crash tail both counted (not just one 15-min cap)",
        total > IDLE_LIMIT_SECS + 300,
        f"got {total}s, expected notably more than the {IDLE_LIMIT_SECS}s idle cap alone "
        "(the ~600s from the pre-crash ticks should also be present)",
    )


# ── 3. Midnight split ──
def test_midnight_split():
    db = fresh_db()
    repo = ProjectRepository(db)
    p = repo.get("proj3")
    yesterday_midnight = time.mktime((date.today() - timedelta(days=1)).timetuple())
    # 10 minutes before midnight tonight -> 10 min into today
    ten_min_before_midnight_tonight = time.mktime(date.today().timetuple()) - 10 * 60
    p.running_since = ten_min_before_midnight_tonight
    repo.save(p)
    db.close()

    db = fresh_db()
    repo = ProjectRepository(db)
    engine = ProjectEngine(repo)
    engine.toggle_timer("proj3")  # stop "now" (some point today)
    yesterday_row = repo.get_activity("proj3", str(date.today() - timedelta(days=1)))
    today_secs = engine.secs_today("proj3")
    db.close()

    check(
        "midnight split: yesterday's bucket got credited",
        yesterday_row is not None and yesterday_row.secs > 0,
        f"yesterday_row={yesterday_row}",
    )
    check("midnight split: today's bucket also got credited", today_secs > 0)


# ── 4. Exclusivity ──
def test_exclusivity():
    db = fresh_db()
    repo = ProjectRepository(db)
    engine = ProjectEngine(repo)
    engine.toggle_timer("proj4")  # start proj4
    p4 = repo.get("proj4")
    check("exclusivity: proj4 is running after its own start", p4.running_since is not None)

    engine.toggle_timer("proj5")  # start proj5 -> should stop proj4
    p4 = repo.get("proj4")
    p5 = repo.get("proj5")
    check("exclusivity: starting proj5 stopped proj4", p4.running_since is None)
    check("exclusivity: proj5 is now running", p5.running_since is not None)
    db.close()


# ── 5. Task timer: idle cap on stop after a stale open session ──
def test_task_idle_cap():
    db = fresh_db()
    repo = TaskRepository(db)
    task_engine = TaskEngine(repo, ProjectRepository(db))
    t = task_engine.create_task("timer regression check", "classic")
    db.commit()

    task_engine.toggle_timer(t.id)  # start
    task = repo.get(t.id)
    sessions = list(task.sessions)
    sessions[-1] = {**sessions[-1], "start": time.time() - 5000}  # simulate a crash
    task.sessions = sessions
    repo.save(task)

    task_engine.toggle_timer(t.id)  # stop
    task = repo.get(t.id)
    check(
        "task idle cap: stale open session credits only IDLE_LIMIT_SECS",
        abs(task.secs - IDLE_LIMIT_SECS) < 2,
        f"got {task.secs}s",
    )
    check("task session closed", task.sessions[-1]["end"] is not None)
    db.close()


# ── 6. Task timer: periodic tick preserves progress, checkpoints forward ──
def test_task_tick_checkpoint():
    db = fresh_db()
    repo = TaskRepository(db)
    task_engine = TaskEngine(repo, ProjectRepository(db))
    t = task_engine.create_task("tick checkpoint check", "focus")
    db.commit()
    task_engine.toggle_timer(t.id)  # start
    db.close()

    for _ in range(3):
        db = fresh_db()
        repo = TaskRepository(db)
        reconcile_all_tasks(repo)
        db.commit()
        db.close()
        time.sleep(0.05)

    db = fresh_db()
    repo = TaskRepository(db)
    task = repo.get(t.id)
    has_checkpoint = "checkpoint" in task.sessions[-1]
    still_open = task.sessions[-1]["end"] is None
    check("task tick: session stays open across ticks (no auto-stop)", still_open)
    check("task tick: checkpoint key present after ticking", has_checkpoint)
    db.close()


# ── 7. Subtask delete no longer raises IntegrityError when a task references it ──
def test_subtask_fk_unlink():
    db = fresh_db()
    project_repo = ProjectRepository(db)
    project_repo.add_subtask(ProjectSubtask(
        pid="proj6:1:0", project_key="proj6", text="sub", done=False, added_date=str(date.today())
    ))
    task_repo = TaskRepository(db)
    task = task_repo.add(Task(
        id=int(time.time() * 1000), list_key="focus", text="orphan check", done=False,
        secs=0.0, sessions=[], est=0, mit=False, day=str(date.today()), urgency="med",
        strike=False, project="proj6", psrc="proj6:1:0",
    ))
    db.close()

    db = fresh_db()
    project_repo = ProjectRepository(db)
    sub = project_repo.get_subtask("proj6:1:0")
    try:
        project_repo.delete_subtask(sub)
        raised = False
    except Exception:
        raised = True
        traceback.print_exc()
    db.close()

    db = fresh_db()
    task_repo = TaskRepository(db)
    reloaded = task_repo.get(task.id)
    check("subtask FK unlink: delete did not raise IntegrityError", not raised)
    check(
        "subtask FK unlink: referencing task's psrc was nulled, task otherwise intact",
        reloaded is not None and reloaded.psrc is None and reloaded.text == "orphan check",
    )
    db.close()


# ── 8. Task timer: reset is undoable ──
def test_reset_timer_is_undoable():
    db = fresh_db()
    repo = TaskRepository(db)
    task_engine = TaskEngine(repo, ProjectRepository(db))
    t = task_engine.create_task("reset/undo check", "classic")
    db.commit()

    # Bank some real time, then close the session.
    task_engine.toggle_timer(t.id)
    task = repo.get(t.id)
    sessions = list(task.sessions)
    sessions[-1] = {**sessions[-1], "start": time.time() - 600}
    task.sessions = sessions
    repo.save(task)
    task_engine.toggle_timer(t.id)

    before = repo.get(t.id)
    prev_secs, prev_sessions = before.secs, list(before.sessions)
    check("banked time before reset", prev_secs > 0, f"got {prev_secs}")

    task_engine.reset_timer(t.id)
    after = repo.get(t.id)
    check("reset clears secs", after.secs == 0.0, f"got {after.secs}")
    check("reset clears sessions", after.sessions == [], f"got {after.sessions}")

    # This is what Ctrl+Z calls. restore_task cannot serve it: the task
    # still exists, so restore_task deliberately no-ops.
    task_engine.restore_timer(t.id, prev_secs, prev_sessions)
    back = repo.get(t.id)
    check("undo restores secs exactly", back.secs == prev_secs, f"got {back.secs} want {prev_secs}")
    check("undo restores the session list", back.sessions == prev_sessions,
          f"got {back.sessions}")

    check("restore_timer on an unknown task returns None",
          task_engine.restore_timer(999999, 1.0, []) is None)

    # restore_task is the delete-undo path and must stay a no-op here,
    # or the two undo routes would silently overlap.
    check("restore_task still no-ops on a live task",
          task_engine.restore_task({"id": t.id, "list_key": "classic", "text": "x"}) is None)
    db.close()


# ── 9. Shutdown: stop_all_running closes open sessions ──
def test_stop_all_running_on_shutdown():
    """Note this file shares ONE database across its tests (fresh_db is
    just SessionLocal()), and an earlier test deliberately leaves a
    session open. So this asserts on the specific tasks it created, not
    on a global count."""
    db = fresh_db()
    repo = TaskRepository(db)
    task_engine = TaskEngine(repo, ProjectRepository(db))
    a = task_engine.create_task("shutdown running", "classic")
    c = task_engine.create_task("shutdown never started", "classic")
    db.commit()

    task_engine.toggle_timer(a.id)
    task = repo.get(a.id)
    sessions = list(task.sessions)
    sessions[-1] = {**sessions[-1], "start": time.time() - 240, "checkpoint": time.time() - 60}
    task.sessions = sessions
    repo.save(task)

    closed = task_engine.stop_all_running()
    check("stop_all_running closed at least the open one", closed >= 1, f"got {closed}")
    check("the running task's session is closed",
          repo.get(a.id).sessions[-1]["end"] is not None)
    check("a task that was never started is untouched",
          repo.get(c.id).sessions == [] and repo.get(c.id).secs == 0)
    check("re-running does not reopen or double-close anything",
          repo.get(a.id).sessions[-1]["end"] is not None)
    db.close()


def test_open_session_left_by_an_abrupt_exit_banks_idle_time():
    """The actual reason to stop timers at shutdown.

    The idle cap is measured from the last CHECKPOINT, and the scheduler
    checkpoints about once a minute, so an abrupt exit loses almost no
    real time — a clean stop is NOT more accurate, which is what an
    earlier version of this change wrongly claimed.

    The harm is different: tick_task never auto-stops. So a session left
    open by an abrupt exit is still open on the next launch, and startup
    reconciliation credits min(gap, idle_limit) where the gap is the
    whole time the app was CLOSED. Leave it overnight and the task banks
    a full idle limit of time nobody worked, and still shows as running.
    """
    db = fresh_db()
    repo = TaskRepository(db)
    task_engine = TaskEngine(repo, ProjectRepository(db))
    t = task_engine.create_task("abrupt exit", "classic")
    db.commit()

    task_engine.toggle_timer(t.id)
    task = repo.get(t.id)
    sessions = list(task.sessions)
    # Checkpointed a moment before the app was killed, then closed for
    # eight hours.
    eight_hours = 8 * 3600
    sessions[-1] = {
        **sessions[-1],
        "start": time.time() - eight_hours - 300,
        "checkpoint": time.time() - eight_hours,
    }
    task.sessions = sessions
    task.secs = 300.0
    repo.save(task)

    reconcile_all_tasks(repo)
    after = repo.get(t.id)
    banked = after.secs - 300.0
    check("startup reconciliation banks idle time for a session left open",
          banked >= IDLE_LIMIT_SECS - 1, f"banked {banked}s")
    check("and the session is STILL open, so it reads as running",
          after.sessions[-1]["end"] is None)

    # With a clean shutdown the session would have been closed instead,
    # so none of the above can happen.
    t2 = task_engine.create_task("clean exit", "classic")
    db.commit()
    task_engine.toggle_timer(t2.id)
    task2 = repo.get(t2.id)
    sessions2 = list(task2.sessions)
    sessions2[-1] = {**sessions2[-1], "start": time.time() - 300, "checkpoint": time.time() - 60}
    task2.sessions = sessions2
    task2.secs = 240.0
    repo.save(task2)

    task_engine.stop_all_running()
    secs_at_close = repo.get(t2.id).secs
    reconcile_all_tasks(repo)
    after2 = repo.get(t2.id)
    check("a cleanly stopped session is closed", after2.sessions[-1]["end"] is not None)
    check("and startup reconciliation adds nothing to it",
          after2.secs == secs_at_close, f"{after2.secs} vs {secs_at_close}")
    db.close()


def run_all():
    tests = [
        test_idle_cap_on_stop,
        test_ticks_preserved_before_crash,
        test_midnight_split,
        test_exclusivity,
        test_task_idle_cap,
        test_task_tick_checkpoint,
        test_subtask_fk_unlink,
        test_reset_timer_is_undoable,
        test_stop_all_running_on_shutdown,
        test_open_session_left_by_an_abrupt_exit_banks_idle_time,
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
    try:
        ok = run_all()
    finally:
        os.remove(DB_PATH)
    raise SystemExit(0 if ok else 1)
