import time
from datetime import date

from database.models import Task
from database.repository import ProjectRepository, TaskRepository
from engine.tasks import StrikeLimitReached, STRIKE_MAX, reset_strike_if_new_day, struck_tasks_in_view, sync_project_row
from engine.timer_reconciliation import start_project, stop_task_and_project


def _today() -> str:
    return str(date.today())


def _is_running(task: Task) -> bool:
    sessions = task.sessions or []
    return bool(sessions) and sessions[-1].get("end") is None


class NowEngine:
    """The right-panel "NOW" pointer — matches the legacy app's
    _now_task family. Deliberately thin: NOW has no state of its own
    beyond AppState.now_task_id (an override, not a source of truth) —
    everything else is derived live from Task/Project, same split
    legacy keeps between _now_id and _now_task()."""

    def __init__(self, task_repo: TaskRepository, project_repo: ProjectRepository):
        self.tasks = task_repo
        self.projects = project_repo

    def get(self) -> Task | None:
        """An explicit pointer wins only while it still qualifies
        (struck, not done); otherwise the first unfinished struck task
        in the current day-view — matches _now_task exactly. Never
        raises or "fixes" a stale pointer; it just stops answering with
        it, which is what makes completing/un-starring/deleting the
        pointed-to task self-healing instead of leaving a dangling id."""
        reset_strike_if_new_day(self.tasks)
        state = self.tasks.get_app_state()
        if state.now_task_id is not None:
            t = self.tasks.get(state.now_task_id)
            if t is not None and t.strike and not t.done:
                return t
        for t in struck_tasks_in_view(self.tasks):
            if not t.done:
                return t
        return None

    def set_now(self, task_id: int) -> Task | None:
        """Point at a task explicitly. Matches _set_now: any running
        clock stops first (task + linked project) — switching is not
        the same as starting, so the newly-pointed task waits for a
        deliberate toggle_run. Not validated against task_id actually
        qualifying — same as legacy, the derive logic in get() is what
        decides whether the pointer is honored."""
        cur = self.get()
        if cur is not None and _is_running(cur):
            stop_task_and_project(self.tasks, self.projects, cur)
        state = self.tasks.get_app_state()
        state.now_task_id = task_id
        self.tasks.save_app_state(state)
        return self.get()

    def toggle_run(self) -> Task | None:
        """START / PAUSE for the NOW task. Starting also starts its
        linked project's timer (the whole payoff of Task.project
        existing — TODAY PROGRESS, Consistency and the trend chart all
        fill themselves from the act of doing the work). Starting also
        stops every OTHER running task's clock first — "one clock at a
        time" is unique to NOW; the regular per-task timer toggle
        deliberately allows concurrent task timers (a Plan task and a
        Focus task can run together there)."""
        t = self.get()
        if t is None:
            return None
        if _is_running(t):
            stop_task_and_project(self.tasks, self.projects, t)
        else:
            for other in self.tasks.list():
                if other.id != t.id and _is_running(other):
                    stop_task_and_project(self.tasks, self.projects, other)
            sessions = list(t.sessions or [])
            sessions.append({"start": time.time(), "end": None})
            t.sessions = sessions
            self.tasks.save(t)
            if t.project:
                project = self.projects.get(t.project)
                if project is not None:
                    start_project(self.projects, project)
                    self.projects.save(project)
        return self.get()

    def complete(self) -> Task | None:
        """COMPLETE — finish the NOW task and point at the next one. The
        clock does NOT carry over: finishing one thing and starting the
        next are two separate decisions (matches _complete_now — the
        same reasoning as the idle-stop, so a walk to the kettle can
        never get quietly banked as deep work on whatever's next)."""
        t = self.get()
        if t is None:
            return None
        stop_task_and_project(self.tasks, self.projects, t)
        t.done = True
        self.tasks.save(t)
        sync_project_row(self.projects, t)
        state = self.tasks.get_app_state()
        state.now_task_id = None
        self.tasks.save_app_state(state)
        return self.get()

    def strike_project_task(self, pid: str) -> Task:
        """"+ STRIKE": commit a project subtask into today's Focus list.
        Matches _strike_project_task — re-strikes the existing promoted
        task if one exists and isn't done yet (refreshing day/project/
        text to match), otherwise creates a new Focus task carrying
        project+psrc. Raises StrikeLimitReached at the same STRIKE_MAX
        the regular strike toggle enforces, checked against the SAME
        day-view-filtered list so the two can't disagree about how full
        today is."""
        subtask = self.projects.get_subtask(pid)
        if subtask is None:
            raise ValueError("Subtask not found")

        cur = self.tasks.get_by_psrc(pid)
        if cur is not None and not cur.done:
            if not cur.strike:
                if len(struck_tasks_in_view(self.tasks)) >= STRIKE_MAX:
                    raise StrikeLimitReached(STRIKE_MAX)
                cur.strike = True
            cur.day = _today()
            cur.project = subtask.project_key
            cur.text = subtask.text
            return self.tasks.save(cur)

        if len(struck_tasks_in_view(self.tasks)) >= STRIKE_MAX:
            raise StrikeLimitReached(STRIKE_MAX)
        task = Task(
            id=int(time.time() * 1000),
            list_key="focus",
            text=subtask.text,
            done=False,
            secs=0.0,
            sessions=[],
            est=0,
            mit=False,
            day=_today(),
            urgency="med",
            strike=True,
            project=subtask.project_key,
            psrc=pid,
        )
        return self.tasks.add(task)
