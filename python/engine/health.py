"""Health — a 4-week plan of meals and workouts, shown a week at a time.

The plan itself is a built-in default template (this module), not rows:
a weekday decides the workout type and the day's protein, and the plan
week (1-4: Foundation, Build, Push, Lock in) turns the workout dose up a
little. Only what the user DID is stored (HealthDayLog), plus their
profile (HealthProfile) — so the default can always be restored by
simply not having edits. Per-day editing is the next phase.

Numbers are estimates and are labelled that way in the UI:
- targets use the Mifflin-St Jeor equation for resting energy, times a
  common activity factor, then -500 kcal (lose) / +300 kcal (gain);
- meal calories/protein are rough per-portion estimates for ordinary
  home cooking, not measured values. They are there to show balance
  across the day, not to be counted to the gram.
"""

from datetime import date, timedelta

from database.models import HealthDayLog, HealthProfile
from database.repository import HealthRepository

SEXES = ("male", "female")
GOALS = ("lose", "maintain", "gain")
ACTIVITIES = ("low", "moderate", "high")
PLACES = ("home", "gym")
ACTIVITY_FACTOR = {"low": 1.2, "moderate": 1.45, "high": 1.7}
GOAL_KCAL = {"lose": -500, "maintain": 0, "gain": 300}
PROTEIN_PER_KG = {"lose": 1.4, "maintain": 1.2, "gain": 1.6}
KCAL_FLOOR = {"male": 1500, "female": 1200}

WEEK_NAMES = ("Foundation", "Build", "Push", "Lock in")
MEAL_SLOTS = 4

# Weekday (Mon=0) -> workout kind.
WEEKDAY_WORKOUT = ("strength_a", "walk", "mobility", "strength_b", "walk", "strength_a", "rest")
WORKOUT_NAME = {
    "strength_a": "Strength A",
    "strength_b": "Strength B",
    "walk": "Brisk walk",
    "mobility": "Mobility & core",
    "rest": "Rest day",
}

# Rotating main protein for lunch (by weekday) and dinner (weekday + 3).
# (name, approx kcal, approx protein g) for one home-cooked portion.
PROTEINS = (
    ("Rui fish curry", 180, 22),
    ("Chicken curry", 220, 26),
    ("Egg curry (2 eggs)", 190, 13),
    ("Chicken bhuna", 240, 27),
    ("Pangas fish curry", 200, 20),
    ("Chickpea (chola) curry", 210, 10),
    ("Dal khichuri with egg", 330, 16),
)


def _today() -> str:
    return str(date.today())


def targets(p: HealthProfile) -> dict:
    s = 5 if p.sex == "male" else -161
    bmr = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + s
    kcal = bmr * ACTIVITY_FACTOR[p.activity] + GOAL_KCAL[p.goal]
    kcal = max(KCAL_FLOOR[p.sex], kcal)
    protein = p.weight_kg * PROTEIN_PER_KG[p.goal]
    # ~35 ml per kg, in 250 ml glasses, never fewer than 8.
    glasses = max(8, round(p.weight_kg * 35 / 250))
    return {
        "kcal": int(round(kcal / 10) * 10),
        "protein_g": int(round(protein / 5) * 5),
        "water_glasses": int(glasses),
    }


def _meals(weekday: int) -> list[dict]:
    lunch = PROTEINS[weekday]
    dinner = PROTEINS[(weekday + 3) % 7]
    return [
        {"slot": 0, "name": "Breakfast", "time": "8:00 AM",
         "items": "2 atta ruti · 2 boiled eggs · mixed vegetables", "kcal": 420, "protein_g": 22},
        {"slot": 1, "name": "Lunch", "time": "1:30 PM",
         "items": f"1 cup rice · {lunch[0]} · masoor dal · salad",
         "kcal": 200 + lunch[1] + 115 + 30, "protein_g": 4 + lunch[2] + 9},
        {"slot": 2, "name": "Snack", "time": "5:00 PM",
         "items": "1 guava · 20 g peanuts", "kcal": 220, "protein_g": 8},
        {"slot": 3, "name": "Dinner", "time": "8:30 PM",
         "items": f"2 ruti · {dinner[0]} · lau shobji", "kcal": 200 + dinner[1] + 60, "protein_g": 6 + dinner[2] + 2},
    ]


def _workout(kind: str, week: int, place: str) -> list[dict]:
    """Blocks of moves; `week` 0-3 turns the dose up gradually."""
    sets = (2, 3, 3, 4)[week]
    walk = (20, 25, 30, 30)[week]
    load = "Dumbbell" if place == "gym" else "Bodyweight"
    if kind == "rest":
        return []
    if kind == "walk":
        return [
            {"name": "Warm-up", "minutes": 5, "moves": [["Easy walk", "5 min", "Outdoor"]]},
            {"name": "Main", "minutes": walk, "moves": [["Brisk walk (can talk, not sing)", f"{walk} min", "Outdoor"]]},
            {"name": "Cool-down", "minutes": 5, "moves": [["Calf stretch", "1 min", "Bodyweight"], ["Slow walk", "4 min", "Outdoor"]]},
        ]
    if kind == "mobility":
        return [
            {"name": "Warm-up", "minutes": 3, "moves": [["Neck and shoulder rolls", "2 min", "Bodyweight"]]},
            {"name": "Main", "minutes": 14, "moves": [
                ["Cat-cow", "10 reps", "Mat"], ["Dead bug", f"{sets} × 10", "Mat"],
                ["Side plank", f"{sets} × 20 s", "Mat"], ["Hip flexor stretch", "1 min / side", "Mat"]]},
            {"name": "Cool-down", "minutes": 3, "moves": [["Slow breathing", "3 min", "—"]]},
        ]
    main_a = [["Squat", f"{sets} × 12", load], ["Push-ups (knee or full)", f"{sets} × 10", "Bodyweight"],
              ["Glute bridge", f"{sets} × 15", "Bodyweight"], ["Plank", f"{sets} × 30 s", "Bodyweight"]]
    main_b = [["Reverse lunge", f"{sets} × 10 / leg", load], ["Row", f"{sets} × 12", "Dumbbell" if place == "gym" else "Band"],
              ["Shoulder press", f"{sets} × 10", "Dumbbell" if place == "gym" else "Band"], ["Dead bug", f"{sets} × 10", "Mat"]]
    return [
        {"name": "Warm-up", "minutes": 5, "moves": [["Jumping jacks", "1 min", "Bodyweight"], ["Arm circles", "1 min", "Bodyweight"],
                                                    ["Bodyweight squats", "15 reps", "Bodyweight"]]},
        {"name": "Main", "minutes": 20, "moves": main_a if kind == "strength_a" else main_b},
        {"name": "Cool-down", "minutes": 5, "moves": [["Hamstring stretch", "1 min", "Mat"], ["Child's pose", "1 min", "Mat"],
                                                      ["Slow breathing", "2 min", "—"]]},
    ]


def _move_keys(blocks: list[dict]) -> list[str]:
    return [f"{bi}-{mi}" for bi, b in enumerate(blocks) for mi in range(len(b["moves"]))]


class HealthEngine:
    def __init__(self, repo: HealthRepository):
        self.repo = repo

    # ── profile ──────────────────────────────────────────────────────
    def set_profile(self, age: int, sex: str, height_cm: float, weight_kg: float, goal: str,
                    activity: str, place: str = "home", start_date: str | None = None) -> dict:
        if sex not in SEXES or goal not in GOALS or activity not in ACTIVITIES or place not in PLACES:
            raise ValueError("Unknown sex/goal/activity/place")
        if not (10 <= age <= 100 and 100 <= height_cm <= 250 and 25 <= weight_kg <= 300):
            raise ValueError("Age, height or weight out of range")
        existing = self.repo.get_profile()
        start = start_date or (existing.start_date if existing else _today())
        date.fromisoformat(start)
        self.repo.save_profile(HealthProfile(
            id=1, age=age, sex=sex, height_cm=height_cm, weight_kg=weight_kg,
            goal=goal, activity=activity, place=place, start_date=start, weeks=4,
        ))
        return self.state()

    def restart(self, start_date: str | None = None) -> dict:
        p = self.repo.get_profile()
        if p is None:
            raise ValueError("No plan yet")
        p.start_date = start_date or _today()
        self.repo.save_profile(p)
        return self.state()

    # ── plan ─────────────────────────────────────────────────────────
    def _plan_pos(self, p: HealthProfile, day: str) -> int:
        return (date.fromisoformat(day) - date.fromisoformat(p.start_date)).days

    def plan_for(self, p: HealthProfile, day: str) -> dict:
        pos = self._plan_pos(p, day)
        week = min(max(pos // 7, 0), p.weeks - 1)
        kind = WEEKDAY_WORKOUT[date.fromisoformat(day).weekday()]
        blocks = _workout(kind, week, p.place)
        return {
            "day": day,
            "plan_day": pos + 1,
            "week": week + 1,
            "week_name": WEEK_NAMES[week],
            "in_plan": 0 <= pos < p.weeks * 7,
            "workout": {"kind": kind, "name": WORKOUT_NAME[kind],
                        "minutes": sum(b["minutes"] for b in blocks), "blocks": blocks},
            "meals": _meals(date.fromisoformat(day).weekday()),
        }

    def _status(self, p: HealthProfile, day: str, log: HealthDayLog | None) -> dict:
        plan = self.plan_for(p, day)
        keys = _move_keys(plan["workout"]["blocks"])
        meals = len(set(log.meals)) if log else 0
        moves_done = len(set(log.moves) & set(keys)) if log else 0
        rest = not keys
        workout_done = rest or moves_done == len(keys)
        return {
            "day": day,
            "meals": meals,
            "workout_done": workout_done,
            "rest": rest,
            "moves_done": moves_done,
            "moves_total": len(keys),
            # "On plan": most meals and the workout. Three of four meals
            # is enough — one late snack should not break a streak.
            "on_plan": meals >= 3 and workout_done,
            "water": log.water if log else 0,
        }

    def state(self, day: str | None = None) -> dict:
        p = self.repo.get_profile()
        if p is None:
            return {"profile": None}
        today = _today()
        day = day or today
        d = date.fromisoformat(day)
        monday = d - timedelta(days=d.weekday())
        week_days = [str(monday + timedelta(days=i)) for i in range(7)]
        start = date.fromisoformat(p.start_date)
        plan_days = [str(start + timedelta(days=i)) for i in range(p.weeks * 7)]
        logs = self.repo.logs_for(list(set(week_days + plan_days + [day])))

        def cell(x: str) -> dict:
            s = self._status(p, x, logs.get(x))
            s["future"] = x > today
            return s

        # Streak: consecutive on-plan days ending today (today counts
        # only once it is on plan — an unfinished today doesn't break it).
        streak = 0
        cur = date.fromisoformat(today)
        if not cell(today)["on_plan"]:
            cur -= timedelta(days=1)
        extra = {}
        while str(cur) >= p.start_date:
            k = str(cur)
            if k not in logs and k not in extra:
                extra.update(self.repo.logs_for([k]))
            st = self._status(p, k, logs.get(k) or extra.get(k))
            if not st["on_plan"]:
                break
            streak += 1
            cur -= timedelta(days=1)

        month = [cell(x) for x in plan_days]
        past = [c for c in month if not c["future"] and c["day"] < today]
        log = logs.get(day)
        return {
            "profile": {
                "age": p.age, "sex": p.sex, "height_cm": p.height_cm, "weight_kg": p.weight_kg,
                "goal": p.goal, "activity": p.activity, "place": p.place,
                "start_date": p.start_date, "weeks": p.weeks,
            },
            "targets": targets(p),
            "today": today,
            "day": self.plan_for(p, day),
            "log": {"meals": sorted(set(log.meals)) if log else [], "moves": sorted(set(log.moves)) if log else [],
                    "water": log.water if log else 0},
            "week": [cell(x) for x in week_days],
            "month": month,
            "month_on_plan": sum(1 for c in past if c["on_plan"]),
            "month_elapsed": len(past),
            "streak": streak,
        }

    # ── logging ──────────────────────────────────────────────────────
    def _require(self) -> HealthProfile:
        p = self.repo.get_profile()
        if p is None:
            raise ValueError("No plan yet")
        return p

    def set_meal(self, day: str, slot: int, done: bool) -> dict:
        self._require()
        if not 0 <= slot < MEAL_SLOTS:
            raise ValueError("slot must be 0-3")
        row = self.repo.get_or_create_log(day)
        s = set(row.meals)
        s.add(slot) if done else s.discard(slot)
        row.meals = sorted(s)
        self.repo.save_log(row)
        return self.state(day)

    def set_move(self, day: str, key: str, done: bool) -> dict:
        p = self._require()
        if key not in _move_keys(self.plan_for(p, day)["workout"]["blocks"]):
            raise ValueError("Unknown move for that day")
        row = self.repo.get_or_create_log(day)
        s = set(row.moves)
        s.add(key) if done else s.discard(key)
        row.moves = sorted(s)
        self.repo.save_log(row)
        return self.state(day)

    def add_water(self, day: str, delta: int) -> dict:
        p = self._require()
        row = self.repo.get_or_create_log(day)
        cap = targets(p)["water_glasses"] + 8
        row.water = max(0, min(cap, row.water + delta))
        self.repo.save_log(row)
        return self.state(day)
