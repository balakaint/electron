import re
import time
from datetime import date, timedelta

from database.models import Task
from database.repository import ProjectRepository, TaskRepository
from engine.timer_reconciliation import stop_task_and_project, stop_task_session

_EST_SUFFIX = re.compile(r"~\s*(\d+)\s*m?$")
_URGENCY_LEVELS = ("low", "med", "high")
STRIKE_MAX = 3
DAY_VIEWS = ("today", "tomorrow")


def get_day_view(repo: TaskRepository) -> str:
    return repo.get_app_state().task_day_view or "today"


def set_day_view(repo: TaskRepository, view: str) -> str:
    if view not in DAY_VIEWS:
        raise ValueError(f"view must be one of {DAY_VIEWS}")
    state = repo.get_app_state()
    state.task_day_view = view
    repo.save_app_state(state)
    return view


def _view_date_str(view: str) -> str:
    """ISO date the given view currently points at — matches the legacy
    _task_day_str, used as the default `day` for a newly-created task
    ("switch to Tomorrow, then add" plans tomorrow directly)."""
    d = date.today()
    if view == "tomorrow":
        d += timedelta(days=1)
    return str(d)


def matches_day_view(task_day: str, view: str) -> bool:
    """TODAY matches day<=today (deliberately inclusive of overdue — an
    unfinished task must never silently vanish at midnight). TOMORROW
    matches day>today. The two are exhaustive, so a task is always
    visible in exactly one view — matches _task_matches_day."""
    today = str(date.today())
    return task_day > today if view == "tomorrow" else task_day <= today


class StrikeLimitReached(Exception):
    """Raised on an attempt to strike a 4th task — matches the legacy
    _toggle_strike returning False for the caller to "flash the limit"
    rather than raising or silently allowing it."""


def reset_strike_if_new_day(repo: TaskRepository) -> None:
    """Lazy equivalent of the legacy day-rollover's unconditional
    `task["strike"] = False` for every task. No live tick exists in this
    engine, so this is checked wherever strike state is read or written,
    and from the periodic timer-reconciliation loop — matches the
    "no cron, enforce lazily at the point of use" pattern already used
    for timer safety (see engine.timer_reconciliation)."""
    today = str(date.today())
    state = repo.get_app_state()
    if state.last_strike_reset_day == today:
        return
    for task in repo.list_struck():
        task.strike = False
        repo.save(task)
    state.last_strike_reset_day = today
    repo.save_app_state(state)


def struck_tasks_in_view(repo: TaskRepository) -> list[Task]:
    """Today's committed Focus tasks, filtered to the currently-selected
    day-view — matches legacy's _strike_tasks (which filters through
    _task_matches_day too). Shared by TaskEngine's own STRIKE_MAX check
    and by NowEngine's "+ STRIKE" promotion, so the two never enforce
    the limit against two different lists."""
    view = get_day_view(repo)
    return [t for t in repo.list_struck() if matches_day_view(t.day, view)]


def sync_project_row(project_repo: ProjectRepository, task: Task) -> None:
    """Mirror a promoted task's done-state onto the project-subtask row
    it came from. Matches legacy's _sync_project_row, called on EVERY
    toggle-done (not just NOW's complete) — ticking a task must have the
    same consequence no matter which control did it, or the project's
    own progress bar would disagree with the Focus list about the exact
    same task. No-ops for a task that wasn't promoted from a project."""
    if not task.psrc or not task.project:
        return
    subtask = project_repo.get_subtask(task.psrc)
    if subtask is not None:
        subtask.done = task.done
        project_repo.save_subtask(subtask)


def _parse_est(text: str) -> tuple[str, int]:
    """Split a trailing "~NN" / "~NNm" time-box suffix off task text.

    Matches the legacy _add_task/_edit_task parsing exactly: "write intro
    ~45" becomes text="write intro", est=45. No match means est=0.
    """
    m = _EST_SUFFIX.search(text)
    if not m:
        return text, 0
    est = int(m.group(1))
    stripped = text[: m.start()].strip()
    return (stripped or text), est


class TaskEngine:
    def __init__(self, repo: TaskRepository, project_repo: ProjectRepository):
        self.repo = repo
        self.project_repo = project_repo

    def list_tasks(self, list_key: str | None = None) -> list[Task]:
        """Only the currently-selected day-view's tasks — matches
        _render_tasks filtering _task_list() through _task_matches_day.
        The view is a single global toggle shared by Plan and Focus
        (only Plan's UI exposes the switch), not a per-request choice."""
        view = get_day_view(self.repo)
        return [t for t in self.repo.list(list_key) if matches_day_view(t.day, view)]

    def get_task(self, task_id: int) -> Task | None:
        return self.repo.get(task_id)

    def get_day_view(self) -> str:
        return get_day_view(self.repo)

    def set_day_view(self, view: str) -> str:
        return set_day_view(self.repo, view)

    def create_task(self, text: str, list_key: str = "classic", day: str | None = None) -> Task:
        text = text.strip()
        if not text:
            raise ValueError("Task text cannot be empty")
        clean_text, est = _parse_est(text)
        task = Task(
            id=int(time.time() * 1000),
            list_key=list_key,
            text=clean_text,
            done=False,
            secs=0.0,
            sessions=[],
            est=est,
            mit=False,
            day=day or _view_date_str(get_day_view(self.repo)),
            urgency="med",
            strike=False,
            project=None,
            psrc=None,
        )
        return self.repo.add(task)

    def edit_task(self, task_id: int, text: str) -> Task | None:
        task = self.repo.get(task_id)
        if task is None:
            return None
        text = text.strip()
        if not text:
            return task
        clean_text, est = _parse_est(text)
        task.text = clean_text
        task.est = est
        return self.repo.save(task)

    def delete_task(self, task_id: int) -> bool:
        task = self.repo.get(task_id)
        if task is None:
            return False
        self.repo.delete(task)
        return True

    def restore_task(self, snapshot: dict) -> Task | None:
        """Re-inserts a task exactly as it was, for undoing a delete —
        matches the legacy undo stack re-adding the deleted dict at its
        old spot. No-ops (returns None) if a task with that id already
        exists, e.g. from a double-fired undo."""
        if self.repo.get(snapshot["id"]) is not None:
            return None
        task = Task(**snapshot)
        return self.repo.add(task)

    def toggle_done(self, task_id: int) -> Task | None:
        task = self.repo.get(task_id)
        if task is None:
            return None
        task.done = not task.done
        if task.done:
            stop_task_session(task, idle_limit_secs=self.repo.get_app_state().idle_stop_min * 60)
        sync_project_row(self.project_repo, task)
        return self.repo.save(task)

    def set_mit(self, task_id: int) -> Task | None:
        """Exactly one MIT per list — matches the Tkinter _set_mit
        semantics of clearing every sibling in the same list first."""
        task = self.repo.get(task_id)
        if task is None:
            return None
        for sibling in self.repo.list(task.list_key):
            if sibling.id == task.id:
                continue
            if sibling.mit:
                sibling.mit = False
                self.repo.save(sibling)
        task.mit = not task.mit
        return self.repo.save(task)

    def cycle_urgency(self, task_id: int) -> Task | None:
        task = self.repo.get(task_id)
        if task is None:
            return None
        i = _URGENCY_LEVELS.index(task.urgency) if task.urgency in _URGENCY_LEVELS else 1
        task.urgency = _URGENCY_LEVELS[(i + 1) % 3]
        return self.repo.save(task)

    def toggle_timer(self, task_id: int) -> Task | None:
        """Stop credits elapsed since the last reconciliation checkpoint
        (idle-capped — see engine.timer_reconciliation), not the raw
        `now - start`, so a session left open across an engine restart
        can't credit the whole downtime on the next stop."""
        task = self.repo.get(task_id)
        if task is None:
            return None
        sessions = list(task.sessions or [])
        if sessions and sessions[-1].get("end") is None:
            stop_task_session(task, idle_limit_secs=self.repo.get_app_state().idle_stop_min * 60)
        else:
            sessions.append({"start": time.time(), "end": None})
            task.sessions = sessions
        return self.repo.save(task)

    def reset_timer(self, task_id: int) -> Task | None:
        task = self.repo.get(task_id)
        if task is None:
            return None
        task.secs = 0.0
        task.sessions = []
        return self.repo.save(task)

    def list_strike_tasks(self) -> list[Task]:
        """Today's committed Focus tasks (matches _strike_tasks, which
        reads tasks_focus filtered by strike AND the day-view)."""
        reset_strike_if_new_day(self.repo)
        return struck_tasks_in_view(self.repo)

    def toggle_strike(self, task_id: int, project_key: str | None = None) -> Task | None:
        """Put a Focus task in / take it out of today's three — matches
        _toggle_strike. Only Focus-list tasks are accepted: legacy
        technically lets _find_task strike a Plan task too, but
        _strike_tasks() only ever reads tasks_focus, so that path is an
        inert quirk (the flag would be set but never counted or shown);
        rejecting it here is a deliberate simplification, not a gap.

        Raises StrikeLimitReached when trying to add a 4th — the route
        turns that into a 4xx the UI can flash, same as the legacy
        caller checking the False return.
        """
        reset_strike_if_new_day(self.repo)
        task = self.repo.get(task_id)
        if task is None or task.list_key != "focus":
            return None

        if task.strike:
            # BUG THIS FIXES (matches the legacy comment at
            # _toggle_strike): un-starring a task whose own clock is
            # running must stop that clock AND its linked project's
            # clock, or the project keeps ticking with no visible way to
            # stop it once the task is off the strike list — the only
            # two places (NOW, the strike list) with a stop button.
            stop_task_and_project(self.repo, self.project_repo, task)
            task.strike = False
        else:
            if len(struck_tasks_in_view(self.repo)) >= STRIKE_MAX:
                raise StrikeLimitReached(STRIKE_MAX)
            task.strike = True

        if project_key:
            task.project = project_key
        return self.repo.save(task)
