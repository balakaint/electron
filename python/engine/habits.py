from datetime import date, timedelta

from database.models import Habit
from database.repository import HabitRepository

CATEGORIES = ("money", "health", "relation", "mind")


class HabitEngine:
    def __init__(self, repo: HabitRepository):
        self.repo = repo

    def list_habits(self, category: str | None = None) -> list[Habit]:
        return self.repo.list(category)

    def list_with_status(self, day: str, category: str | None = None) -> list[dict]:
        habits = self.repo.list(category)
        done_ids = {c.habit_id for c in self.repo.completions_for_day(day) if c.done}
        return [
            {
                "id": h.id,
                "category": h.category,
                "name": h.name,
                "sort_order": h.sort_order,
                "active": h.active,
                "done": h.id in done_ids,
            }
            for h in habits
        ]

    def create_habit(self, category: str, name: str) -> Habit:
        name = name.strip()
        if not name:
            raise ValueError("Habit name cannot be empty")
        existing = self.repo.list(category)
        sort_order = (max((h.sort_order for h in existing), default=-1)) + 1
        habit = Habit(category=category, name=name, sort_order=sort_order, active=True)
        return self.repo.add(habit)

    def rename_habit(self, habit_id: int, name: str) -> Habit | None:
        habit = self.repo.get(habit_id)
        if habit is None:
            return None
        name = name.strip()
        if name:
            habit.name = name
        return self.repo.save(habit)

    def deactivate_habit(self, habit_id: int) -> Habit | None:
        habit = self.repo.get(habit_id)
        if habit is None:
            return None
        habit.active = False
        return self.repo.save(habit)

    def toggle_completion(self, habit_id: int, day: str) -> bool:
        row = self.repo.get_completion(habit_id, day)
        new_done = not (row.done if row is not None else False)
        self.repo.upsert_completion(habit_id, day, new_done)
        return new_done

    def _day_counts(self, day: str) -> tuple[int, int]:
        """(done, total) across all active habits for one ISO date —
        mirrors _habit_day_counts: total is today's active habit set,
        applied uniformly to every day checked (the legacy app never
        reconstructed a historical habit list either)."""
        active_ids = {h.id for h in self.repo.list()}
        total = len(active_ids)
        if total == 0:
            return 0, 0
        done = sum(
            1
            for c in self.repo.completions_for_day(day)
            if c.done and c.habit_id in active_ids
        )
        return done, total

    def day_summary(self, day: str) -> dict:
        habits_by_cat = {cat: self.repo.list(cat) for cat in CATEGORIES}
        completions = {c.habit_id: c.done for c in self.repo.completions_for_day(day)}

        categories = {}
        total_done = total_all = 0
        for cat, habits in habits_by_cat.items():
            done = sum(1 for h in habits if completions.get(h.id, False))
            total = len(habits)
            categories[cat] = {
                "done": done,
                "total": total,
                "pct": int(done / total * 100) if total else 0,
            }
            total_done += done
            total_all += total

        return {
            "day": day,
            "score": int(total_done / total_all * 100) if total_all else 0,
            "categories": categories,
        }

    def streak(self) -> int:
        """Consecutive days ending today with >=50% of active habits
        done — matches _habit_streak's deliberately-forgiving threshold."""
        streak = 0
        d = date.today()
        while True:
            done, total = self._day_counts(str(d))
            if total == 0 or done / total < 0.5:
                break
            streak += 1
            d -= timedelta(days=1)
        return streak

    def week_scores(self) -> list[dict]:
        out = []
        for i in range(6, -1, -1):
            d = date.today() - timedelta(days=i)
            done, total = self._day_counts(str(d))
            out.append({
                "day": str(d),
                "label": d.strftime("%a"),
                "pct": int(done / total * 100) if total else 0,
            })
        return out

    def get_intention(self, day: str) -> str:
        row = self.repo.get_intention(day)
        return row.text if row is not None else ""

    def set_intention(self, day: str, text: str) -> str:
        row = self.repo.set_intention(day, text)
        return row.text
