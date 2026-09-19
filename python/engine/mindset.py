from datetime import date, timedelta

from database.repository import MindsetRepository

# Was engine/habits.py's HabitEngine — also ran the flat Money/Health/
# Relation/Mind checklist, its streak/week/monthly scoring, and the
# Win/Reflection/Intention daily notes. All removed 2026-09-14 (Zahid:
# "emon task list mainly regular chek kora hoy na" — that kind of list
# wasn't actually checked regularly); the Discipline tab now holds the
# 3 guided-module cards instead (renderer/src/components/
# DisciplineModuleCards.tsx). Only Mindset (PlanReview.tsx's own tab, a
# genuinely separate feature) survives, renamed rather than left in a
# file called "habits" with nothing habit-related left in it.


class MindsetEngine:
    def __init__(self, repo: MindsetRepository):
        self.repo = repo

    def get_mindset(self, day: str) -> str:
        row = self.repo.get_journal(day)
        return row.mindset if row is not None else ""

    def set_mindset(self, day: str, text: str) -> str:
        row = self.repo.set_mindset(day, text)
        return row.mindset

    def get_design_today(self, day: str) -> str:
        row = self.repo.get_journal(day)
        return row.design_today if row is not None else ""

    def set_design_today(self, day: str, text: str) -> str:
        row = self.repo.set_design_today(day, text)
        return row.design_today

    def mindset_history(self, days_back: int = 7) -> list[dict]:
        """The last `days_back` days of mindset notes, newest first,
        skipping days with nothing written.

        The history IS the feature, in legacy's own words: "A single note
        box is just a scratchpad you overwrite every morning; seven of
        them next to each other is the only way to notice you've written
        'stop procrastinating on the export docs' five days running."
        Today is excluded — it is already on screen in the editor above.
        """
        today = date.today()
        days = [str(today - timedelta(days=i)) for i in range(1, days_back + 1)]
        found = self.repo.mindset_history(days)
        return [
            {
                "day": d,
                "label": date.fromisoformat(d).strftime("%a %d"),
                "text": found[d],
            }
            for d in days
            if d in found
        ]
