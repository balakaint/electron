"""Health plan engine (engine/health.py).

    python python/test_health.py

Fresh temp SQLite per test. What matters: no profile means no plan;
targets follow the Mifflin-St Jeor numbers; the plan's week and workout
come from the date; logging meals/moves/water round-trips; "on plan"
and the streak count what the page says they count.
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
        from database.repository import HealthRepository
        from engine.health import HealthEngine
        self.db = connection.SessionLocal()
        self.engine = HealthEngine(HealthRepository(self.db))
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


TODAY = date.today()


def d(n):
    return str(TODAY + timedelta(days=n))


def setup(f, start_offset=0):
    return f.engine.set_profile(34, "male", 170, 78, "lose", "low", "home", d(start_offset))


def test_no_profile_no_plan():
    with FreshDB() as f:
        check("state without a profile says so", f.engine.state() == {"profile": None})
        try:
            f.engine.set_meal(d(0), 0, True)
            check("logging without a plan is refused", False)
        except ValueError:
            check("logging without a plan is refused", True)


def test_targets():
    with FreshDB() as f:
        s = setup(f)
        # BMR = 10*78 + 6.25*170 - 5*34 + 5 = 1677.5; *1.2 = 2013; -500 = 1513 -> 1510
        check("kcal from Mifflin-St Jeor, low activity, -500", s["targets"]["kcal"] == 1510, str(s["targets"]))
        check("protein 1.4 g/kg rounded to 5", s["targets"]["protein_g"] == 110)
        check("water at least 8 glasses", s["targets"]["water_glasses"] >= 8)
        s = f.engine.set_profile(30, "female", 150, 45, "lose", "low", "home", d(0))
        check("kcal never below the floor", s["targets"]["kcal"] >= 1200, str(s["targets"]))


def test_plan_weeks_and_workouts():
    with FreshDB() as f:
        setup(f, start_offset=-8)
        s = f.engine.state()
        check("day 9 of the plan is week 2", s["day"]["week"] == 2 and s["day"]["plan_day"] == 9, str(s["day"]["plan_day"]))
        check("week 2 is Build", s["day"]["week_name"] == "Build")
        check("four meals a day", len(s["day"]["meals"]) == 4)
        check("week strip is 7 days, Monday first",
              len(s["week"]) == 7 and date.fromisoformat(s["week"][0]["day"]).weekday() == 0)
        check("month is the whole 28-day plan", len(s["month"]) == 28)
        sunday = str(TODAY + timedelta(days=6 - TODAY.weekday()))
        check("Sunday is a rest day", f.engine.state(sunday)["day"]["workout"]["kind"] == "rest")


def test_logging_and_on_plan():
    with FreshDB() as f:
        setup(f, start_offset=-3)
        day = d(-1)
        blocks = f.engine.state(day)["day"]["workout"]["blocks"]
        keys = [f"{bi}:{m[0]}" for bi, b in enumerate(blocks) for m in b["moves"]]
        for slot in (0, 1, 2):
            s = f.engine.set_meal(day, slot, True)
        check("meals round-trip", s["log"]["meals"] == [0, 1, 2])
        s = f.engine.set_meal(day, 1, False)
        check("meal can be unticked", s["log"]["meals"] == [0, 2])
        f.engine.set_meal(day, 1, True)
        for k in keys:
            s = f.engine.set_move(day, k, True)
        cell = [c for c in s["week"] + s["month"] if c["day"] == day][0]
        check("3 meals + all moves is on plan", cell["on_plan"] or cell["rest"], str(cell))
        try:
            f.engine.set_move(day, "9:Nope", True)
            check("unknown move refused", False)
        except ValueError:
            check("unknown move refused", True)
        s = f.engine.add_water(d(0), 3)
        s = f.engine.add_water(d(0), -5)
        check("water never negative", s["log"]["water"] == 0)


def test_streak():
    with FreshDB() as f:
        setup(f, start_offset=-5)

        def complete(day):
            st = f.engine.state(day)
            for slot in range(4):
                f.engine.set_meal(day, slot, True)
            for bi, b in enumerate(st["day"]["workout"]["blocks"]):
                for m in b["moves"]:
                    f.engine.set_move(day, f"{bi}:{m[0]}", True)

        complete(d(-2))
        complete(d(-1))
        s = f.engine.state()
        check("streak counts yesterday back, unfinished today doesn't break it", s["streak"] == 2, str(s["streak"]))
        check("month counts elapsed on-plan days", s["month_on_plan"] == 2 and s["month_elapsed"] == 5,
              f'{s["month_on_plan"]}/{s["month_elapsed"]}')
        complete(d(0))
        check("finishing today extends the streak", f.engine.state()["streak"] == 3)


def _weekday_day(offset_from_today_weekday):
    """A date in the plan whose weekday is `offset_from_today_weekday`."""
    return str(TODAY + timedelta(days=(offset_from_today_weekday - TODAY.weekday()) % 7))


def test_meal_edit_scopes_and_reset():
    with FreshDB() as f:
        setup(f, start_offset=-7)
        day = d(0)
        same_wd = d(7)
        other = d(1)
        s = f.engine.set_meal_items(day, 1, [{"food": "Rice (cooked)", "qty": 1.5}, {"food": "Chicken curry", "qty": 1}], "day")
        lunch = s["day"]["meals"][1]
        check("day edit applies", [p["food"] for p in lunch["parts"]] == ["Rice (cooked)", "Chicken curry"], str(lunch["parts"]))
        check("portion scales kcal", lunch["parts"][0]["kcal"] == 300)
        check("edited marks the scope", lunch["edited"] == "day")
        check("day edit stays on that day", f.engine.state(same_wd)["day"]["meals"][1]["edited"] is None)

        f.engine.set_meal_items(day, 2, [{"food": "Banana", "qty": 1}], "weekday")
        check("weekday edit reaches the same weekday next week",
              f.engine.state(same_wd)["day"]["meals"][2]["parts"][0]["food"] == "Banana")
        check("weekday edit skips other weekdays", f.engine.state(other)["day"]["meals"][2]["edited"] is None)

        f.engine.set_meal_items(other, 0, [{"food": "Oats", "qty": 1}, {"food": "Milk", "qty": 1}], "all")
        check("all-days edit reaches every day", f.engine.state(same_wd)["day"]["meals"][0]["edited"] == "all")
        f.engine.set_meal_items(day, 0, [{"food": "Chira (flattened rice)", "qty": 1}], "day")
        check("most specific edit wins", f.engine.state(day)["day"]["meals"][0]["edited"] == "day")

        s = f.engine.reset(day, "day")
        check("reset day drops the day edit only", s["day"]["meals"][1]["edited"] is None and s["day"]["meals"][2]["edited"] == "weekday")
        s = f.engine.reset(day, "all")
        check("reset all brings the default back", all(m["edited"] is None for m in s["day"]["meals"]))
        for bad in ([], [{"food": "", "qty": 1}], [{"food": "Rice (cooked)", "qty": 0}]):
            try:
                f.engine.set_meal_items(day, 1, bad, "day")
                check("bad meal refused", False, str(bad))
            except ValueError:
                pass


def test_block_edit_and_ticks_follow_names():
    with FreshDB() as f:
        setup(f, start_offset=-7)
        day = _weekday_day(0)  # Monday: strength A
        s = f.engine.state(day)
        main = s["day"]["workout"]["blocks"][1]
        first = main["moves"][0][0]
        f.engine.set_move(day, f"1:{first}", True)
        moves = [{"name": m[0], "dose": m[1]} for m in main["moves"]][::-1] + [{"name": "Mountain climbers"}]
        s = f.engine.set_block_moves(day, 1, moves, "day")
        names = [m[0] for m in s["day"]["workout"]["blocks"][1]["moves"]]
        check("block edit applies, library dose fills in", names[-1] == "Mountain climbers"
              and s["day"]["workout"]["blocks"][1]["moves"][-1][1] == "3 × 30 s")
        check("a tick follows its move after reordering", f"1:{first}" in s["log"]["moves"])
        try:
            f.engine.set_block_moves(day, 1, [{"name": "Plank"}, {"name": "Plank"}], "day")
            check("duplicate move refused", False)
        except ValueError:
            check("duplicate move refused", True)


def test_diet_dislikes_and_swaps():
    with FreshDB() as f:
        setup(f, start_offset=0)
        day = _weekday_day(0)  # Monday lunch = Rui fish curry
        s = f.engine.set_diet(["vegetarian", "bogus"])
        check("unknown diet dropped", s["profile"]["diet"] == ["vegetarian"])
        lunch = f.engine.state(day)["day"]["meals"][1]
        check("vegetarian replaces fish in the default", "Rui fish curry" not in lunch["items"], lunch["items"])
        sw = [x["name"] for x in f.engine.swaps("Egg curry")]
        check("swaps respect the diet", all("fish" not in n.lower() and "chicken" not in n.lower() for n in sw), str(sw))
        f.engine.set_dislike("Chickpea (chola) curry", True)
        sw = [x["name"] for x in f.engine.swaps("Egg curry")]
        check("disliked foods never suggested", "Chickpea (chola) curry" not in sw, str(sw))
        lib = f.engine.library()
        check("library flags disliked", any(x["disliked"] for x in lib["foods"] if x["name"] == "Chickpea (chola) curry"))
        s = f.engine.set_profile(35, "male", 170, 78, "lose", "low", "home")
        check("editing the profile keeps diet and dislikes",
              s["profile"]["diet"] == ["vegetarian"] and s["profile"]["dislikes"] == ["Chickpea (chola) curry"])


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
