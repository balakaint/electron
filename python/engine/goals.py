import time
from datetime import date

from database.models import GOAL_HORIZONS, Goal
from database.repository import GoalRepository, TaskRepository


def _today() -> str:
    return str(date.today())


def _day_number(start_date: str) -> int:
    """Matches the legacy day_number(): days elapsed since start_date,
    1-indexed, falling back to 1 on a malformed date rather than
    raising."""
    try:
        return (date.today() - date.fromisoformat(start_date)).days + 1
    except ValueError:
        return 1


class GoalEngine:
    def __init__(self, repo: GoalRepository):
        self.repo = repo

    def list_goals(self, project_key: str, horizon: str | None = None) -> list[dict]:
        return [self._goal_out(g) for g in self.repo.list(project_key, horizon)]

    def create_goal(
        self, project_key: str, horizon: str, text: str, start_date: str | None = None, note: str = ""
    ) -> dict:
        text = text.strip()
        if not text:
            raise ValueError("Goal title cannot be empty")
        if horizon not in GOAL_HORIZONS:
            raise ValueError(f"horizon must be one of {GOAL_HORIZONS}")
        sd = start_date or _today()
        try:
            date.fromisoformat(sd)
        except ValueError:
            sd = _today()
        goal = Goal(
            id=int(time.time() * 1000),
            project_key=project_key,
            horizon=horizon,
            text=text,
            done=False,
            start_date=sd,
            done_date=None,
            note=note.strip(),
        )
        return self._goal_out(self.repo.add(goal))

    def edit_goal(
        self, goal_id: int, text: str | None = None, start_date: str | None = None, note: str | None = None
    ) -> dict | None:
        goal = self.repo.get(goal_id)
        if goal is None:
            return None
        if text is not None and text.strip():
            goal.text = text.strip()
        if start_date is not None:
            try:
                date.fromisoformat(start_date)
                goal.start_date = start_date
            except ValueError:
                pass
        if note is not None:
            goal.note = note.strip()
        return self._goal_out(self.repo.save(goal))

    def toggle_goal(self, goal_id: int) -> dict | None:
        goal = self.repo.get(goal_id)
        if goal is None:
            return None
        goal.done = not goal.done
        goal.done_date = _today() if goal.done else None
        return self._goal_out(self.repo.save(goal))

    def delete_goal(self, goal_id: int) -> bool:
        goal = self.repo.get(goal_id)
        if goal is None:
            return False
        self.repo.delete(goal)
        return True

    @staticmethod
    def _goal_out(goal: Goal) -> dict:
        return {
            "id": goal.id,
            "project_key": goal.project_key,
            "horizon": goal.horizon,
            "text": goal.text,
            "done": goal.done,
            "start_date": goal.start_date,
            "done_date": goal.done_date,
            "note": goal.note,
            "day_number": _day_number(goal.start_date),
        }


# ── Panel-level settings ─────────────────────────────────────────────
# Which project the Goals panel currently shows, and the (optional)
# renamed section headings — both global AppState fields, not
# per-project data. Reuses TaskRepository for the app_state singleton
# rather than a new repository class, same reasoning as engine.settings.

def get_goal_panel(repo: TaskRepository) -> dict:
    state = repo.get_app_state()
    return {
        "project_key": state.goal_project,
        "sec_title_yearly": state.sec_title_yearly,
        "sec_title_monthly": state.sec_title_monthly,
        "sec_title_weekly": state.sec_title_weekly,
    }


def set_goal_project(repo: TaskRepository, project_key: str) -> dict:
    state = repo.get_app_state()
    state.goal_project = project_key
    repo.save_app_state(state)
    return get_goal_panel(repo)


def set_section_title(repo: TaskRepository, horizon: str, title: str) -> dict:
    if horizon not in GOAL_HORIZONS:
        raise ValueError(f"horizon must be one of {GOAL_HORIZONS}")
    state = repo.get_app_state()
    setattr(state, f"sec_title_{horizon}", title.strip() or None)
    repo.save_app_state(state)
    return get_goal_panel(repo)
