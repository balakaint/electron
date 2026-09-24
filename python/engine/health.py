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


# ── Food library ─────────────────────────────────────────────────────
# One home-cooked portion each: (name, portion, kcal, protein g, group,
# tags). Rough estimates for ordinary cooking, labelled as such in the
# UI — they exist to show a day's balance, not to be counted to the gram.
# Tags: "meat" (not vegetarian), "beef".
FOODS = [
    ("Rice (cooked)", "1 cup", 200, 4, "grain", ()),
    ("Atta ruti", "1 piece", 100, 3, "grain", ()),
    ("Brown bread", "1 slice", 80, 3, "grain", ()),
    ("Oats", "40 g", 150, 5, "grain", ()),
    ("Chira (flattened rice)", "½ cup", 120, 2, "grain", ()),
    ("Mug dal khichuri", "1 bowl", 300, 12, "grain", ()),
    ("Boiled egg", "1 egg", 78, 6, "protein", ()),
    ("Egg curry", "2 eggs", 190, 13, "protein", ()),
    ("Rui fish curry", "1 piece", 180, 22, "protein", ("meat",)),
    ("Pangas fish curry", "1 piece", 200, 20, "protein", ("meat",)),
    ("Chicken curry", "1 bowl", 220, 26, "protein", ("meat",)),
    ("Chicken bhuna", "1 bowl", 240, 27, "protein", ("meat",)),
    ("Beef curry", "1 bowl", 280, 25, "protein", ("meat", "beef")),
    ("Chickpea (chola) curry", "1 bowl", 210, 10, "protein", ()),
    ("Masoor dal", "½ cup", 115, 9, "protein", ()),
    ("Mug dal", "½ cup", 110, 8, "protein", ()),
    ("Doi (yogurt)", "1 cup", 150, 8, "protein", ()),
    ("Milk", "1 glass", 120, 8, "protein", ()),
    ("Mixed vegetables", "1 bowl", 90, 3, "veg", ()),
    ("Lau shobji", "1 bowl", 60, 2, "veg", ()),
    ("Shak (leafy greens)", "1 bowl", 50, 3, "veg", ()),
    ("Begun bhaji", "1 serving", 120, 2, "veg", ()),
    ("Salad", "1 bowl", 30, 1, "veg", ()),
    ("Guava", "1", 70, 2, "fruit", ()),
    ("Banana", "1", 105, 1, "fruit", ()),
    ("Apple", "1", 95, 0, "fruit", ()),
    ("Papaya", "1 cup", 60, 1, "fruit", ()),
    ("Peanuts", "20 g", 115, 5, "snack", ()),
    ("Almonds", "10", 70, 3, "snack", ()),
]
FOOD = {f[0]: f for f in FOODS}

# Rotating main protein for lunch (by weekday) and dinner (weekday + 3).
PROTEINS = (
    "Rui fish curry", "Chicken curry", "Egg curry", "Chicken bhuna",
    "Pangas fish curry", "Chickpea (chola) curry", "Mug dal khichuri",
)
# What stands in for a meat protein when the diet is vegetarian.
VEG_SWAP = {"Rui fish curry": "Egg curry", "Pangas fish curry": "Chickpea (chola) curry",
            "Chicken curry": "Egg curry", "Chicken bhuna": "Chickpea (chola) curry",
            "Beef curry": "Chickpea (chola) curry"}

MEAL_META = (("Breakfast", "8:00 AM"), ("Lunch", "1:30 PM"), ("Snack", "5:00 PM"), ("Dinner", "8:30 PM"))


def _default_meal_items(weekday: int, slot: int) -> list[dict]:
    if slot == 0:
        return [{"food": "Atta ruti", "qty": 2}, {"food": "Boiled egg", "qty": 2}, {"food": "Mixed vegetables", "qty": 1}]
    if slot == 1:
        return [{"food": "Rice (cooked)", "qty": 1}, {"food": PROTEINS[weekday], "qty": 1},
                {"food": "Masoor dal", "qty": 1}, {"food": "Salad", "qty": 1}]
    if slot == 2:
        return [{"food": "Guava", "qty": 1}, {"food": "Peanuts", "qty": 1}]
    return [{"food": "Atta ruti", "qty": 2}, {"food": PROTEINS[(weekday + 3) % 7], "qty": 1},
            {"food": "Lau shobji", "qty": 1}]


def _allowed(name: str, diet: list[str]) -> bool:
    f = FOOD.get(name)
    if f is None:
        return True
    if "vegetarian" in diet and "meat" in f[5]:
        return False
    if "no_beef" in diet and "beef" in f[5]:
        return False
    return True


def _meal(slot: int, items: list[dict], diet: list[str], edited: str | None) -> dict:
    parts = []
    for it in items:
        name = it["food"]
        if not _allowed(name, diet):
            name = VEG_SWAP.get(name, "Chickpea (chola) curry")
        f = FOOD.get(name)
        qty = float(it.get("qty", 1))
        kcal = round((f[2] if f else 0) * qty)
        prot = round((f[3] if f else 0) * qty)
        parts.append({"food": name, "qty": qty, "portion": f[1] if f else "", "kcal": kcal, "protein_g": prot,
                      "known": f is not None})
    label = " · ".join((f"{p['qty']:g} × " if p["qty"] != 1 else "") + p["food"] for p in parts)
    return {"slot": slot, "name": MEAL_META[slot][0], "time": MEAL_META[slot][1], "items": label,
            "kcal": sum(p["kcal"] for p in parts), "protein_g": sum(p["protein_g"] for p in parts),
            "parts": parts, "edited": edited}


# ── Exercise library ────────────────────────────────────────────────
# (name, category, equipment, level 1-3, default dose)
EXERCISES = [
    ("Jumping jacks", "cardio", "Bodyweight", 1, "1 min"),
    ("Arm circles", "flexibility", "Bodyweight", 1, "1 min"),
    ("Bodyweight squats", "strength", "Bodyweight", 1, "15 reps"),
    ("Squat", "strength", "Bodyweight", 1, "3 × 12"),
    ("Goblet squat", "strength", "Dumbbell", 2, "3 × 12"),
    ("Push-ups (knee or full)", "strength", "Bodyweight", 1, "3 × 10"),
    ("Glute bridge", "strength", "Bodyweight", 1, "3 × 15"),
    ("Plank", "core", "Bodyweight", 1, "3 × 30 s"),
    ("Side plank", "core", "Mat", 2, "2 × 20 s"),
    ("Dead bug", "core", "Mat", 1, "3 × 10"),
    ("Reverse lunge", "strength", "Bodyweight", 2, "3 × 10 / leg"),
    ("Row", "strength", "Band", 1, "3 × 12"),
    ("Dumbbell row", "strength", "Dumbbell", 2, "3 × 12"),
    ("Shoulder press", "strength", "Band", 1, "3 × 10"),
    ("Mountain climbers", "cardio", "Bodyweight", 2, "3 × 30 s"),
    ("High knees", "cardio", "Bodyweight", 2, "3 × 30 s"),
    ("Skipping rope", "cardio", "Rope", 2, "5 min"),
    ("Easy walk", "cardio", "Outdoor", 1, "5 min"),
    ("Brisk walk (can talk, not sing)", "cardio", "Outdoor", 1, "20 min"),
    ("Slow walk", "cardio", "Outdoor", 1, "4 min"),
    ("Cat-cow", "flexibility", "Mat", 1, "10 reps"),
    ("Hip flexor stretch", "flexibility", "Mat", 1, "1 min / side"),
    ("Hamstring stretch", "flexibility", "Mat", 1, "1 min"),
    ("Calf stretch", "flexibility", "Bodyweight", 1, "1 min"),
    ("Child's pose", "flexibility", "Mat", 1, "1 min"),
    ("World's greatest stretch", "flexibility", "Mat", 1, "5 / side"),
    ("Neck and shoulder rolls", "flexibility", "Bodyweight", 1, "2 min"),
    ("Slow breathing", "flexibility", "—", 1, "2 min"),
]
EXERCISE = {e[0]: e for e in EXERCISES}


def _moves(pairs: list[list[str]]) -> list[list[str]]:
    """[name, dose] -> [name, dose, equipment] (equipment from the library;
    a custom move the library doesn't know shows "—")."""
    return [[n, d, EXERCISE[n][2] if n in EXERCISE else "—"] for n, d in pairs]


def _workout(kind: str, week: int, place: str) -> list[dict]:
    """Default blocks of [name, dose] moves; `week` 0-3 turns the dose up."""
    sets = (2, 3, 3, 4)[week]
    walk = (20, 25, 30, 30)[week]
    gym = place == "gym"
    if kind == "rest":
        return []
    if kind == "walk":
        return [
            {"name": "Warm-up", "minutes": 5, "moves": [["Easy walk", "5 min"]]},
            {"name": "Main", "minutes": walk, "moves": [["Brisk walk (can talk, not sing)", f"{walk} min"]]},
            {"name": "Cool-down", "minutes": 5, "moves": [["Calf stretch", "1 min"], ["Slow walk", "4 min"]]},
        ]
    if kind == "mobility":
        return [
            {"name": "Warm-up", "minutes": 3, "moves": [["Neck and shoulder rolls", "2 min"]]},
            {"name": "Main", "minutes": 14, "moves": [["Cat-cow", "10 reps"], ["Dead bug", f"{sets} × 10"],
                                                      ["Side plank", f"{sets} × 20 s"], ["Hip flexor stretch", "1 min / side"]]},
            {"name": "Cool-down", "minutes": 3, "moves": [["Slow breathing", "3 min"]]},
        ]
    main_a = [["Goblet squat" if gym else "Squat", f"{sets} × 12"], ["Push-ups (knee or full)", f"{sets} × 10"],
              ["Glute bridge", f"{sets} × 15"], ["Plank", f"{sets} × 30 s"]]
    main_b = [["Reverse lunge", f"{sets} × 10 / leg"], ["Dumbbell row" if gym else "Row", f"{sets} × 12"],
              ["Shoulder press", f"{sets} × 10"], ["Dead bug", f"{sets} × 10"]]
    return [
        {"name": "Warm-up", "minutes": 5, "moves": [["Jumping jacks", "1 min"], ["Arm circles", "1 min"], ["Bodyweight squats", "15 reps"]]},
        {"name": "Main", "minutes": 20, "moves": main_a if kind == "strength_a" else main_b},
        {"name": "Cool-down", "minutes": 5, "moves": [["Hamstring stretch", "1 min"], ["Child's pose", "1 min"], ["Slow breathing", "2 min"]]},
    ]


def _move_keys(blocks: list[dict]) -> list[str]:
    # By name, not position, so editing a block doesn't move ticks onto
    # the wrong exercise.
    return [f"{bi}:{m[0]}" for bi, b in enumerate(blocks) for m in b["moves"]]


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
            diet=list(existing.diet or []) if existing else [],
            dislikes=list(existing.dislikes or []) if existing else [],
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

    def _overrides(self) -> dict[tuple[str, str, int], list]:
        # Loaded once per engine (one per request) — plan_for runs for
        # every cell of the month.
        if getattr(self, "_ov", None) is None:
            self._ov = {(o.kind, o.scope, o.idx): o.data for o in self.repo.overrides()}
        return self._ov

    def _resolve(self, kind: str, day: str, idx: int) -> tuple[list | None, str | None]:
        ov = self._overrides()
        wd = date.fromisoformat(day).weekday()
        for scope, label in ((f"day:{day}", "day"), (f"wd:{wd}", "weekday"), ("all", "all")):
            if (kind, scope, idx) in ov:
                return ov[(kind, scope, idx)], label
        return None, None

    def plan_for(self, p: HealthProfile, day: str) -> dict:
        pos = self._plan_pos(p, day)
        week = min(max(pos // 7, 0), p.weeks - 1)
        wd = date.fromisoformat(day).weekday()
        kind = WEEKDAY_WORKOUT[wd]
        blocks = []
        for bi, b in enumerate(_workout(kind, week, p.place)):
            data, edited = self._resolve("block", day, bi)
            pairs = [[m["name"], m["dose"]] for m in data] if data is not None else b["moves"]
            blocks.append({"name": b["name"], "minutes": b["minutes"], "moves": _moves(pairs), "edited": edited})
        diet = list(p.diet or [])
        meals = []
        for slot in range(MEAL_SLOTS):
            data, edited = self._resolve("meal", day, slot)
            meals.append(_meal(slot, data if data is not None else _default_meal_items(wd, slot), diet, edited))
        return {
            "day": day,
            "plan_day": pos + 1,
            "week": week + 1,
            "week_name": WEEK_NAMES[week],
            "in_plan": 0 <= pos < p.weeks * 7,
            "workout": {"kind": kind, "name": WORKOUT_NAME[kind],
                        "minutes": sum(b["minutes"] for b in blocks), "blocks": blocks},
            "meals": meals,
        }

    # ── editing ──────────────────────────────────────────────────────
    @staticmethod
    def _scope(day: str, scope: str) -> str:
        date.fromisoformat(day)
        if scope == "day":
            return f"day:{day}"
        if scope == "weekday":
            return f"wd:{date.fromisoformat(day).weekday()}"
        if scope == "all":
            return "all"
        raise ValueError("scope must be day, weekday or all")

    def set_meal_items(self, day: str, slot: int, items: list[dict], scope: str = "day") -> dict:
        self._require()
        if not 0 <= slot < MEAL_SLOTS:
            raise ValueError("slot must be 0-3")
        clean = []
        for it in items:
            name = str(it.get("food", "")).strip()
            qty = float(it.get("qty", 1))
            if not name or not 0 < qty <= 10:
                raise ValueError("Each item needs a food and a portion between 0 and 10")
            clean.append({"food": name, "qty": round(qty * 2) / 2})
        if not clean:
            raise ValueError("A meal needs at least one item")
        self.repo.set_override("meal", self._scope(day, scope), slot, clean)
        self._ov = None
        return self.state(day)

    def set_block_moves(self, day: str, block: int, moves: list[dict], scope: str = "day") -> dict:
        p = self._require()
        blocks = self.plan_for(p, day)["workout"]["blocks"]
        if not 0 <= block < len(blocks):
            raise ValueError("No such workout block that day")
        clean = []
        for m in moves:
            name = str(m.get("name", "")).strip()
            if not name:
                raise ValueError("Each move needs a name")
            dose = str(m.get("dose", "")).strip() or (EXERCISE[name][4] if name in EXERCISE else "")
            clean.append({"name": name, "dose": dose})
        if len({c["name"] for c in clean}) != len(clean):
            raise ValueError("A move appears twice in the block")
        self.repo.set_override("block", self._scope(day, scope), block, clean)
        self._ov = None
        return self.state(day)

    def reset(self, day: str, scope: str) -> dict:
        """scope "day": this date's edits; "weekday": this date's and its
        weekday's; "all": every edit in the plan."""
        self._require()
        date.fromisoformat(day)
        wd = date.fromisoformat(day).weekday()
        if scope == "day":
            self.repo.delete_overrides([f"day:{day}"])
        elif scope == "weekday":
            self.repo.delete_overrides([f"day:{day}", f"wd:{wd}"])
        elif scope == "all":
            self.repo.delete_overrides(None)
        else:
            raise ValueError("scope must be day, weekday or all")
        self._ov = None
        return self.state(day)

    def set_diet(self, diet: list[str]) -> dict:
        p = self._require()
        p.diet = [d for d in dict.fromkeys(diet) if d in ("vegetarian", "no_beef")]
        self.repo.save_profile(p)
        return self.state()

    def set_dislike(self, food: str, dislike: bool) -> dict:
        p = self._require()
        s = list(p.dislikes or [])
        if dislike and food not in s:
            s.append(food)
        if not dislike and food in s:
            s.remove(food)
        p.dislikes = s
        self.repo.save_profile(p)
        return self.state()

    def library(self) -> dict:
        p = self._require()
        diet = list(p.diet or [])
        dislikes = set(p.dislikes or [])
        return {
            "foods": [{"name": f[0], "portion": f[1], "kcal": f[2], "protein_g": f[3], "group": f[4],
                       "allowed": _allowed(f[0], diet), "disliked": f[0] in dislikes} for f in FOODS],
            "exercises": [{"name": e[0], "category": e[1], "equipment": e[2], "level": e[3], "dose": e[4]}
                          for e in EXERCISES],
        }

    def swaps(self, food: str) -> list[dict]:
        """Up to three alternatives in the same group, allowed by the diet,
        not disliked, closest in protein first (then in calories)."""
        p = self._require()
        f = FOOD.get(food)
        if f is None:
            return []
        diet = list(p.diet or [])
        dislikes = set(p.dislikes or [])
        cands = [g for g in FOODS if g[4] == f[4] and g[0] != food and g[0] not in dislikes and _allowed(g[0], diet)]
        cands.sort(key=lambda g: (abs(g[3] - f[3]), abs(g[2] - f[2])))
        return [{"name": g[0], "portion": g[1], "kcal": g[2], "protein_g": g[3]} for g in cands[:3]]

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
                "diet": list(p.diet or []), "dislikes": list(p.dislikes or []),
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
