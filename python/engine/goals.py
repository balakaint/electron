import calendar
import time
from datetime import date, timedelta

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


def _add_months(d: date, months: int) -> date:
    """Calendar-correct month addition (stdlib only — no dateutil
    dependency in this project). Clamps the day when the target month is
    shorter (Jan 31 + 1 month -> Feb 28/29, not an overflow into March),
    matching how every other calendar app handles it."""
    total = d.month - 1 + months
    year = d.year + total // 12
    month = total % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


# Default deadline window per stored `horizon`, from Zahid's own request:
# weekly goal -> 7 days, monthly -> 30 days, yearly -> 12 months.
#
# ⚠ That is by DISPLAYED label, and GoalsPanel.tsx's HORIZONS array
# crosses the displayed label against the stored `horizon` key on
# purpose (see that file's own ⚠ comment: horizon=yearly shows as
# "WEEKLY GOAL", horizon=weekly shows as "YEARLY GOAL"). So the mapping
# below is correct exactly because it looks backwards next to the
# horizon's name — yearly gets 7 days, weekly gets 12 months. Changing
# this to look "right" next to the horizon name would silently make the
# deadline shown under WEEKLY GOAL default to 12 months instead of 7
# days. Cross-check against GoalsPanel.tsx's HORIZONS before touching
# either side of this pairing.
def _default_deadline(horizon: str, start_date: str) -> str:
    try:
        sd = date.fromisoformat(start_date)
    except ValueError:
        sd = date.today()
    if horizon == "yearly":  # displayed "WEEKLY GOAL"
        return str(sd + timedelta(days=7))
    if horizon == "monthly":  # displayed "MONTHLY GOAL"
        return str(sd + timedelta(days=30))
    # horizon == "weekly", displayed "YEARLY GOAL"
    return str(_add_months(sd, 12))


class GoalEngine:
    # project_key is opaque here — this engine never looks a project up,
    # so it already worked for the reserved "life" owner (see
    # database/models.py's Goal.project_key comment) with no change.
    # Only the DB's FK and the API schema's Literal type ever restricted
    # which strings were legal.
    def __init__(self, repo: GoalRepository):
        self.repo = repo

    def list_goals(self, project_key: str, horizon: str | None = None) -> list[dict]:
        return [self._goal_out(g) for g in self.repo.list(project_key, horizon)]

    def create_goal(
        self,
        project_key: str,
        horizon: str,
        text: str,
        start_date: str | None = None,
        note: str = "",
        next_action: str = "",
        deadline: str | None = None,
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
        # An explicit deadline (the calendar dropdown, once the goal is
        # open) always wins; otherwise fall back to the horizon default —
        # see _default_deadline's own ⚠ for why the 7/30/12mo pairing
        # looks crossed against the horizon name.
        dl = deadline
        if dl is not None:
            try:
                date.fromisoformat(dl)
            except ValueError:
                dl = None
        if dl is None:
            dl = _default_deadline(horizon, sd)
        goal = Goal(
            id=int(time.time() * 1000),
            project_key=project_key,
            horizon=horizon,
            text=text,
            done=False,
            start_date=sd,
            done_date=None,
            note=note.strip(),
            next_action=next_action.strip(),
            deadline=dl,
        )
        return self._goal_out(self.repo.add(goal))

    def edit_goal(
        self,
        goal_id: int,
        text: str | None = None,
        start_date: str | None = None,
        note: str | None = None,
        next_action: str | None = None,
        deadline: str | None = None,
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
        if next_action is not None:
            goal.next_action = next_action.strip()
        if deadline is not None:
            try:
                date.fromisoformat(deadline)
                goal.deadline = deadline
            except ValueError:
                pass
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
            "next_action": goal.next_action,
            "deadline": goal.deadline,
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
