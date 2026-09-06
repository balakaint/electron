import re
import time
from datetime import date, datetime, timedelta

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


def _task_title_key(list_key: str, view: str) -> str:
    return f"task_title_{list_key}_{view}"


def default_task_title(list_key: str, view: str) -> str:
    """Matches legacy's DEFAULT_TASK_TITLE branch: FOCUS is named for its
    relationship to the STRIKE LIST card above it ("LIST" — the pool you
    promote three of into STRIKE, "TASK LIST" once Tomorrow's view has
    no STRIKE card to relate to); CLASSIC is named for what it holds
    ("TARGETS" — everything the day owes you)."""
    if list_key == "focus":
        return "TASK LIST" if view == "tomorrow" else "LIST"
    return "TOMORROW'S TARGETS" if view == "tomorrow" else "TODAY'S TARGETS"


def get_task_title(repo: TaskRepository, list_key: str, view: str) -> str:
    state = repo.get_app_state()
    saved = getattr(state, _task_title_key(list_key, view))
    return saved or default_task_title(list_key, view)


def set_task_title(repo: TaskRepository, list_key: str, view: str, title: str) -> str:
    state = repo.get_app_state()
    setattr(state, _task_title_key(list_key, view), title.strip() or None)
    repo.save_app_state(state)
    return get_task_title(repo, list_key, view)


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

    def get_task_title(self, list_key: str) -> str:
        return get_task_title(self.repo, list_key, get_day_view(self.repo))

    def set_task_title(self, list_key: str, title: str) -> str:
        return set_task_title(self.repo, list_key, get_day_view(self.repo), title)

    def check_mit_prompt(self) -> tuple[bool, list[Task]]:
        """Once a day: if Classic's current view has open tasks and none
        of them is the MIT, surface up to 8 for the caller to prompt
        with — matches legacy's _maybe_mit_prompt, which the port
        retires on Focus the same way legacy's own comment describes
        (Focus's NOW/strike surface already asks this permanently, so a
        popup over it would cover the very screen answering it); the
        frontend only calls this while Classic is the active list.
        Marks today as prompted the moment it decides to show — not on
        whatever the user later picks — same as legacy setting
        mit_prompt_date before building the dialog, so a dismiss-without-
        choosing still counts as already asked today."""
        state = self.repo.get_app_state()
        today = str(date.today())
        if state.mit_prompt_date == today:
            return False, []
        open_tasks = [t for t in self.list_tasks("classic") if not t.done]
        if not open_tasks or any(t.mit for t in open_tasks):
            return False, []
        state.mit_prompt_date = today
        self.repo.save_app_state(state)
        return True, open_tasks[:8]

    def capacity_insight(self) -> str | None:
        """A suggestion built entirely from the user's own historical
        session data, matching legacy's _capacity_insight — no cloud
        call, no AI, no new dependency. Buckets every task-timer
        session's start hour (across Classic + Focus) and, only if one
        hour clearly dominates (>=25% of all logged time, with a
        minimum sample so one lucky session can't skew it), names it.
        Returns None — shown as nothing — rather than a fabricated
        "you're a morning person" guess when there isn't enough data;
        an honest blank beats a made-up insight."""
        buckets: dict[int, float] = {}
        total = 0.0
        for task in self.repo.list():
            for session in task.sessions:
                start = session.get("start")
                if not start:
                    continue
                end = session.get("end") or start
                dur = max(0.0, end - start)
                if dur <= 0:
                    continue
                hr = datetime.fromtimestamp(start).hour
                buckets[hr] = buckets.get(hr, 0.0) + dur
                total += dur
        if total < 3600:
            return None
        peak_hr = max(buckets, key=buckets.get)
        if buckets[peak_hr] / total < 0.25:
            return None
        h12 = peak_hr % 12 or 12
        ap = "AM" if peak_hr < 12 else "PM"
        return f"You tend to do deep work around {h12} {ap} — good time to start"

    def create_task(self, text: str, list_key: str = "classic", day: str | None = None) -> Task:
        text = text.strip()
        if not text:
            raise ValueError("Task text cannot be empty")
        clean_text, est = _parse_est(text)
        existing = self.repo.list(list_key)
        sort_order = (max((t.sort_order for t in existing), default=-1)) + 1
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
            sort_order=sort_order,
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

    def set_day(self, task_id: int, day: str) -> Task | None:
        """Move a task to an explicit day — matches legacy's
        _send_to_today (a "→ Today" button that just sets `day` to
        today), generalized to any date so the caller can undo it by
        restoring the exact previous value. Tasks aren't split into
        separate collections (see matches_day_view), so this alone
        moves a task between Today/Tomorrow; nothing else changes."""
        task = self.repo.get(task_id)
        if task is None:
            return None
        task.day = day
        return self.repo.save(task)

    def move_task(self, task_id: int, direction: int) -> list[Task] | None:
        """Button-driven stand-in for legacy's drag-to-reorder (same
        pattern as bdp.move_plan): swaps sort_order with the adjacent
        task in the same list_key, done-state, and day-view group.

        Legacy clamps a drag to the task's own done-group because
        _render_tasks always sorts unfinished tasks above finished ones —
        crossing that boundary would spring back on the very next
        render. The done-state check here reproduces that clamp without
        needing the original's slot-preserving index math, since a
        single flat sort_order per list_key (rather than per-day) makes
        a plain adjacent-swap sufficient."""
        if direction not in (-1, 1):
            raise ValueError("direction must be -1 or 1")
        task = self.repo.get(task_id)
        if task is None:
            return None
        view = get_day_view(self.repo)
        group = sorted(
            (t for t in self.repo.list(task.list_key) if matches_day_view(t.day, view) and t.done == task.done),
            key=lambda t: t.sort_order,
        )
        idx = next(i for i, t in enumerate(group) if t.id == task_id)
        swap_idx = idx + direction
        if 0 <= swap_idx < len(group):
            other = group[swap_idx]
            task.sort_order, other.sort_order = other.sort_order, task.sort_order
            self.repo.save(task)
            self.repo.save(other)
        return self.list_tasks(task.list_key)

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
