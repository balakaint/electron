"""Regression test for starting work from an hour you planned.

    python python/test_now_hour.py

The bridge this covers: HOURS is where the day gets written, MIT is
where three tasks get committed, and until now NOW could only see the
second. Pressing play on the hour you are standing in promotes that
entry into a real Focus task so it gets the clock, the "one clock at a
time" rule and COMPLETE — and carries hour_slot_id so finishing it
ticks the hour back.

Three things here are easy to get wrong and are what this file checks:

  1. The promoted task must NOT be struck. STRIKE is the hard ceiling
     of three for the day; a day written out hour by hour can hold
     eight entries, and spending a strike on each would put a limit on
     the plan that the plan never had.
  2. NOW.get() must still HONOUR it anyway — the ceiling and the
     pointer are different questions, and the old rule ("struck and not
     done") answered both with one test.
  3. Both completion paths must agree. Finishing in NOW ticks the hour;
     ticking the hour finishes the task. Either control is a reasonable
     place to say "done" and neither may leave the other one lying.
"""

import os
import tempfile
import traceback
from datetime import date

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

        from database.repository import HourPlanRepository, ProjectRepository, TaskRepository
        from engine.now import NowEngine

        self.db = connection.SessionLocal()
        self.hours = HourPlanRepository(self.db)
        self.tasks = TaskRepository(self.db)
        self.now = NowEngine(self.tasks, ProjectRepository(self.db), self.hours)
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


TODAY = str(date.today())


def test_starting_an_hour_makes_it_now_and_runs():
    with FreshDB() as f:
        f.hours.set_hour_slot(TODAY, 9, text="VAT RETURN")
        t = f.now.start_hour(TODAY, 9)
        check("starting an hour returns a task", t is not None)
        check("  carrying the hour's text", t.text == "VAT RETURN", t.text)
        check("  in the focus list", t.list_key == "focus", t.list_key)
        check("  linked back to the hour row", t.hour_slot_id is not None)
        check("  and its clock is running", bool(t.sessions) and t.sessions[-1]["end"] is None)
        check("NOW points at it", f.now.get() is not None and f.now.get().id == t.id)


def test_an_hour_does_not_spend_a_strike():
    """The whole reason NOW's qualifying test had to change."""
    with FreshDB() as f:
        from engine.tasks import STRIKE_MAX, struck_tasks_in_view
        for h in (9, 10, 11, 13, 14):
            f.hours.set_hour_slot(TODAY, h, text=f"task at {h}")
            f.now.start_hour(TODAY, h)
        struck = struck_tasks_in_view(f.tasks)
        check(
            f"five hours started, still 0 of the {STRIKE_MAX} strikes used",
            len(struck) == 0,
            f"{len(struck)} struck",
        )
        check("and NOW still answers", f.now.get() is not None)


def test_only_one_task_per_hour_however_often_you_press():
    with FreshDB() as f:
        f.hours.set_hour_slot(TODAY, 9, text="VAT RETURN")
        first = f.now.start_hour(TODAY, 9)
        f.now.toggle_run()  # pause
        again = f.now.start_hour(TODAY, 9)
        check("pressing play twice reuses one task", first.id == again.id)
        focus = [t for t in f.tasks.list("focus")]
        check("  and does not stack copies", len(focus) == 1, f"{len(focus)} tasks")


def test_editing_the_hour_updates_the_running_task():
    with FreshDB() as f:
        f.hours.set_hour_slot(TODAY, 9, text="VAT RETURN")
        f.now.start_hour(TODAY, 9)
        f.hours.set_hour_slot(TODAY, 9, text="VAT RETURN (final)")
        t = f.now.start_hour(TODAY, 9)
        check("re-starting picks up the edited wording", t.text == "VAT RETURN (final)", t.text)


def test_completing_in_now_ticks_the_hour():
    with FreshDB() as f:
        f.hours.set_hour_slot(TODAY, 9, text="VAT RETURN")
        f.now.start_hour(TODAY, 9)
        f.now.complete()
        slot = next(s for s in f.hours.hour_slots(TODAY) if s.hour == 9)
        check("completing NOW ticks the hour it came from", slot.done is True)
        check("  stamped with the day it was ticked", slot.done_day == TODAY, str(slot.done_day))
        check("  and NOW is empty again", f.now.get() is None)


def test_an_empty_hour_cannot_be_started():
    with FreshDB() as f:
        try:
            f.now.start_hour(TODAY, 9)
            check("an empty hour is refused", False, "no error raised")
        except ValueError:
            check("an empty hour is refused", True)


def test_a_carried_entry_is_startable_on_a_later_day():
    """A repeating entry keeps the day it was WRITTEN on. If the link
    stored (day, hour) instead of the row id, this is where it would
    break — the task would point at a day that is no longer today."""
    with FreshDB() as f:
        f.hours.set_hour_slot("2020-01-01", 9, text="MORNING PAGES", repeat=True)
        t = f.now.start_hour(TODAY, 9)
        check("a carried entry can be started today", t is not None and t.text == "MORNING PAGES")
        f.now.complete()
        slot = f.hours.get_hour_slot(t.hour_slot_id)
        check("  and completing it ticks the carried row", slot.done is True)
        check("  on today, not the day it was written", slot.done_day == TODAY, str(slot.done_day))


def test_play_on_an_unstruck_task_becomes_now():
    """The bug this covers, in the user's words: "task 3 top timer ea
    ashe na". Play on a task that is not one of today's three used to
    run a private per-row clock while NOW went on saying "Choose today's
    3" — a screen with a running timer and no answer to what am I doing.
    An explicit pointer is now honoured for any unfinished task; the
    ceiling of three is a promise about the DAY, not a lock on the
    clock."""
    with FreshDB() as f:
        from database.models import Task
        import time as _t
        from engine.tasks import reset_strike_if_new_day, struck_tasks_in_view
        reset_strike_if_new_day(f.tasks)
        t = f.tasks.add(
            Task(
                id=int(_t.time() * 1000),
                list_key="focus",
                text="Task 3",
                done=False,
                secs=0.0,
                sessions=[],
                est=0,
                mit=False,
                day=TODAY,
                urgency="high",
                strike=False,
            )
        )
        f.now.set_now(t.id)
        cur = f.now.get()
        check("NOW accepts a task that is not struck", cur is not None and cur.text == "Task 3")
        check("  without spending a strike", len(struck_tasks_in_view(f.tasks)) == 0)
        f.now.toggle_run()
        cur = f.now.get()
        check("  and its clock runs on NOW", bool(cur.sessions) and cur.sessions[-1]["end"] is None)
        f.now.complete()
        check("  completing it clears NOW", f.now.get() is None)


def test_the_star_decides_which_of_the_three_now_opens_on():
    """MIT used to be a control with no consequence — you could star a
    task and nothing on screen changed. It now means "first of the
    three", which is what makes NOW open on the right one in the
    morning rather than on whichever was committed earliest."""
    with FreshDB() as f:
        from database.models import Task
        import time as _t
        # A fresh DB has never had a strike-reset day stamped, so the
        # first read of NOW would clear every strike as a day rollover.
        # Stamp today first — the app does this the moment anything
        # touches strike state.
        from engine.tasks import reset_strike_if_new_day
        reset_strike_if_new_day(f.tasks)

        ids = []
        for i, text in enumerate(("committed first", "committed second", "committed third")):
            t = f.tasks.add(
                Task(
                    id=int(_t.time() * 1000) + i,
                    list_key="focus",
                    text=text,
                    done=False,
                    secs=0.0,
                    sessions=[],
                    est=0,
                    mit=False,
                    day=TODAY,
                    urgency="med",
                    strike=True,
                )
            )
            ids.append(t.id)

        check("with no star, NOW takes the first committed",
              f.now.get().text == "committed first", f.now.get().text)

        third = f.tasks.get(ids[2])
        third.mit = True
        f.tasks.save(third)
        check("starring the third makes NOW open on it",
              f.now.get().text == "committed third", f.now.get().text)

        third.done = True
        f.tasks.save(third)
        check("  and finishing it falls back to the order",
              f.now.get().text == "committed first", f.now.get().text)


def main() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        try:
            t()
        except Exception:
            traceback.print_exc()
            FAILURES.append(t.__name__)
    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILED: {', '.join(FAILURES)}")
        return 1
    print("now/hour checks clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
