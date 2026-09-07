"""Regression test for the TODAY hour-by-hour plan (engine/hour_plan.py).

    python python/test_hour_plan.py

Every test gets its own fresh temp SQLite DB, deleted immediately after
— never touches the real app.db.

The block-assignment algorithm is the reason this file exists. Legacy
carries a warning about it (task_tracker_v3_THEMES.py 5518-5526): the
obvious implementation, range(start, end) per block, assumes the four
phase-start settings are in ascending order. They are clamped 0-23
INDEPENDENTLY, so nothing stops Sleep at 00:00 or Morning after Work,
and legacy reports that most such schedules produced a broken day —
hours in two blocks at once, or blocks of 42 hours.

So the exhaustive check below is the point of the file: all 24^4 =
331,776 settings combinations, asserting every hour lands in exactly
one block. A handful of hand-picked cases would pass against the
broken version, which is why they are not what this checks.
"""

import itertools
import os
import tempfile
import traceback

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

        from database.repository import HourPlanRepository
        from engine.hour_plan import HourPlanEngine

        self.db = connection.SessionLocal()
        self.repo = HourPlanRepository(self.db)
        self.engine = HourPlanEngine(self.repo)
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


def test_every_hour_lands_in_exactly_one_block():
    from engine.hour_plan import BLOCKS, block_hours

    keys = [k for k, _ in BLOCKS]
    bad_combo = None
    checked = 0
    for combo in itertools.product(range(24), repeat=4):
        starts = dict(zip(keys, combo))
        hours = [h for b in block_hours(starts) for h in b.hours]
        checked += 1
        if sorted(hours) != list(range(24)):
            bad_combo = (starts, sorted(hours))
            break
    check(
        f"all {checked} settings combinations assign 24 distinct hours",
        bad_combo is None,
        f"{bad_combo}",
    )


def test_unsorted_phases_still_work():
    """The case legacy's range(start, end) got wrong: Sleep at midnight,
    Morning after Work — a schedule nothing in Settings prevents."""
    from engine.hour_plan import block_hours

    starts = {"morning": 9, "work": 6, "evening": 20, "sleep": 0}
    by_key = {b.key: b.hours for b in block_hours(starts)}
    check("sleep owns midnight through 05:00", by_key["sleep"] == list(range(0, 6)))
    check("work owns 06:00-08:00", by_key["work"] == [6, 7, 8])
    check("morning owns 09:00-19:00", by_key["morning"] == list(range(9, 20)))
    check("evening owns 20:00-23:00", by_key["evening"] == [20, 21, 22, 23])


def test_block_reads_from_its_own_start():
    """Sleep runs 11pm, 12am, 1am — not 12am … 11pm. Sorting by clock
    hour would put the middle of the night first."""
    from engine.hour_plan import block_hours

    starts = {"morning": 5, "work": 9, "evening": 18, "sleep": 23}
    by_key = {b.key: b.hours for b in block_hours(starts)}
    check("sleep starts at 23, not 0", by_key["sleep"][0] == 23, f"{by_key['sleep']}")
    check("and wraps into the small hours", by_key["sleep"][:4] == [23, 0, 1, 2])


def test_empty_hours_are_not_planned():
    with FreshDB() as f:
        plan = f.engine.day("2026-09-07", now_hour=10)
        check("a fresh day has nothing planned", plan["total_planned"] == 0)
        check("and nothing done", plan["total_done"] == 0)
        check("but still lists all 24 hours",
              sum(len(b["hours"]) for b in plan["blocks"]) == 24)


def test_text_makes_a_slot_planned():
    with FreshDB() as f:
        f.engine.set_slot("2026-09-07", 10, text="write the export doc")
        plan = f.engine.day("2026-09-07", now_hour=10)
        check("typing into an hour plans it", plan["total_planned"] == 1)
        check("and it is not done yet", plan["total_done"] == 0)

        f.engine.set_slot("2026-09-07", 10, done=True)
        plan = f.engine.day("2026-09-07", now_hour=10)
        check("ticking it does not blank the text",
              [h for b in plan["blocks"] for h in b["hours"] if h["hour"] == 10][0]["text"]
              == "write the export doc")
        check("and counts as done", plan["total_done"] == 1)


def test_whitespace_only_is_not_a_plan():
    with FreshDB() as f:
        f.engine.set_slot("2026-09-07", 11, text="   ")
        plan = f.engine.day("2026-09-07", now_hour=10)
        check("an hour holding only spaces is not planned", plan["total_planned"] == 0)


def test_clearing_untickets():
    with FreshDB() as f:
        f.engine.set_slot("2026-09-07", 12, text="ship it")
        f.engine.set_slot("2026-09-07", 12, done=True)
        f.engine.clear_slot("2026-09-07", 12)
        plan = f.engine.day("2026-09-07", now_hour=12)
        slot = [h for b in plan["blocks"] for h in b["hours"] if h["hour"] == 12][0]
        check("clearing empties the text", slot["text"] == "")
        check("and drops the tick with it", slot["done"] is False)
        check("so the day counts nothing", plan["total_planned"] == 0 and plan["total_done"] == 0)


def test_days_do_not_bleed():
    with FreshDB() as f:
        f.engine.set_slot("2026-09-07", 9, text="monday work")
        plan = f.engine.day("2026-09-08", now_hour=9)
        check("another day starts empty", plan["total_planned"] == 0)


def test_current_block_follows_the_clock():
    from engine.hour_plan import current_block

    starts = {"morning": 5, "work": 9, "evening": 18, "sleep": 23}
    check("06:00 is morning", current_block(starts, 6) == "morning")
    check("13:00 is work", current_block(starts, 13) == "work")
    check("19:00 is evening", current_block(starts, 19) == "evening")
    check("02:00 is sleep", current_block(starts, 2) == "sleep")


def test_hour_out_of_range_is_refused():
    with FreshDB() as f:
        raised = False
        try:
            f.engine.set_slot("2026-09-07", 24, text="nope")
        except ValueError:
            raised = True
        check("hour 24 is refused", raised)


def _slot(plan, hour):
    for b in plan["blocks"]:
        for h in b["hours"]:
            if h["hour"] == hour:
                return h
    raise AssertionError(f"hour {hour} missing from the plan")


# ── Repeat-until-finished ────────────────────────────────────────────
# NOT a habit. Zahid's words: "everyday fresh start hok, only selected
# task repeat koruk ... eta habit na, most important task, it will repeat
# everyday until i finish". So the day opens empty by default, a marked
# task keeps reappearing, and FINISHING is what ends it — no weekday
# mask, no end date, no separate routines table.

def test_an_ordinary_entry_does_not_carry():
    with FreshDB() as f:
        f.engine.set_slot("2026-09-07", 9, text="one-off")
        check("tomorrow opens empty", f.engine.day("2026-09-08")["total_planned"] == 0)


def test_a_repeating_entry_carries_until_finished():
    with FreshDB() as f:
        f.engine.set_slot("2026-09-07", 9, text="file the export docs")
        f.engine.set_slot("2026-09-07", 9, repeat=True)

        for day in ("2026-09-08", "2026-09-09", "2026-09-20"):
            p = f.engine.day(day)
            check(f"it is still there on {day}", _slot(p, 9)["text"] == "file the export docs")
            check(f"and unticked on {day}", _slot(p, 9)["done"] is False)


def test_finishing_ends_the_carry():
    with FreshDB() as f:
        f.engine.set_slot("2026-09-07", 9, text="file the export docs", repeat=True)
        f.engine.set_slot("2026-09-09", 9, done=True)

        p = f.engine.day("2026-09-09")
        check("it shows as done on the day you ticked it", _slot(p, 9)["done"] is True)
        check("and still counts toward that day", p["total_done"] == 1)

        p = f.engine.day("2026-09-10")
        check("the next morning it is gone", _slot(p, 9)["text"] == "")
        check("and the day is empty again", p["total_planned"] == 0)


def test_unticking_resumes_the_carry():
    with FreshDB() as f:
        f.engine.set_slot("2026-09-07", 9, text="chase the invoice", repeat=True)
        f.engine.set_slot("2026-09-08", 9, done=True)
        f.engine.set_slot("2026-09-08", 9, done=False)
        check("it comes back after an accidental tick",
              _slot(f.engine.day("2026-09-09"), 9)["text"] == "chase the invoice")


def test_editing_changes_every_day():
    """The user's own choice: a carried entry is one thing you keep, so
    editing it edits the routine rather than forking a copy for today."""
    with FreshDB() as f:
        f.engine.set_slot("2026-09-07", 9, text="gym", repeat=True)
        f.engine.set_slot("2026-09-09", 9, text="gym + stretch")
        check("edited on a later day", _slot(f.engine.day("2026-09-09"), 9)["text"] == "gym + stretch")
        check("and the change is there tomorrow too",
              _slot(f.engine.day("2026-09-10"), 9)["text"] == "gym + stretch")
        check("with no duplicate row left behind",
              len(f.repo.hour_slots("2026-09-10")) == 1)


def test_todays_own_entry_beats_a_carried_one():
    with FreshDB() as f:
        f.engine.set_slot("2026-09-07", 9, text="carried", repeat=True)
        f.repo.db.add(__import__("database.models", fromlist=["HourSlot"]).HourSlot(
            day="2026-09-09", hour=9, text="written today", done=False, repeat=False))
        f.repo.db.commit()
        p = f.engine.day("2026-09-09")
        check("one entry in the hour, not two", len([h for h in _all(p) if h["hour"] == 9]) == 1)
        check("and it is today's", _slot(p, 9)["text"] == "written today")


def test_clearing_ends_the_carry():
    with FreshDB() as f:
        f.engine.set_slot("2026-09-07", 9, text="chase the invoice", repeat=True)
        f.engine.clear_slot("2026-09-08", 9)
        check("clearing stops it coming back",
              _slot(f.engine.day("2026-09-09"), 9)["text"] == "")


def test_repeat_survives_a_tick_and_untick_round_trip():
    with FreshDB() as f:
        f.engine.set_slot("2026-09-07", 9, text="ship it", repeat=True)
        f.engine.set_slot("2026-09-07", 9, done=True)
        f.engine.set_slot("2026-09-07", 9, done=False)
        check("still marked as repeating", _slot(f.engine.day("2026-09-07"), 9)["repeat"] is True)


def _all(plan):
    return [h for b in plan["blocks"] for h in b["hours"]]


if __name__ == "__main__":
    for fn in [v for k, v in sorted(globals().items()) if k.startswith("test_")]:
        try:
            fn()
        except Exception:
            traceback.print_exc()
            FAILURES.append(fn.__name__)
    print()
    print(f"FAILURES: {FAILURES}" if FAILURES else "ALL PASS")
    raise SystemExit(1 if FAILURES else 0)
