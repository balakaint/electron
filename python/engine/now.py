import time
from datetime import date

from database.models import Task
from database.repository import GoalRepository, ProjectRepository, TaskRepository
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

    def __init__(self, task_repo: TaskRepository, project_repo: ProjectRepository, hour_repo=None, goal_repo: GoalRepository | None = None):
        self.tasks = task_repo
        self.projects = project_repo
        # Optional so every existing construction site keeps working;
        # only start_hour and the write-back in complete() need it.
        self.hours = hour_repo
        # Optional for the same reason — only strike_goal_task needs it.
        self.goals = goal_repo

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
            # An explicit pointer is honoured for any unfinished task,
            # full stop. It used to also require the task to be struck,
            # which quietly turned the STRIKE ceiling into a lock on the
            # clock: press play on a task that was not one of the three
            # and it ran with NOW still saying "Choose today's 3", so the
            # screen had a running timer and no answer to what am I
            # doing. Two different questions — "is this one of today's
            # three" and "is this what I am working on right now" — were
            # being answered by one flag.
            #
            # The ceiling is unchanged; it is the MIT tab's promise about
            # the DAY, not a rule about the clock. And the pointer still
            # heals itself: a completed or deleted task simply stops
            # qualifying, which is how legacy avoids a dangling id.
            if t is not None and not t.done:
                return t
        open_struck = [t for t in struck_tasks_in_view(self.tasks) if not t.done]
        if not open_struck:
            return None
        # The star picks which of the three comes first.
        #
        # MIT used to be a control with no consequence: you could star a
        # task and nothing on screen changed, while STRIKE — a different
        # control, on the same row, in a different shape — was what
        # actually decided the day. Two priority systems, one of them
        # inert. It now means "first of the three", which is the one job
        # a single-select flag can do that a three-item list cannot do
        # for itself, and it is the reason NOW opens on the right task in
        # the morning instead of whichever was committed earliest.
        return next((t for t in open_struck if t.mit), open_struck[0])

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
        t.done_at = str(date.today())
        self.tasks.save(t)
        sync_project_row(self.projects, t)
        # Finishing here ticks the hour it came from. Without this the
        # plan and the work disagree the moment you use both: HOURS would
        # still show the entry open, with its circle waiting for a second
        # click that means exactly what the first one meant.
        if t.hour_slot_id is not None and self.hours is not None:
            slot = self.hours.get_hour_slot(t.hour_slot_id)
            if slot is not None:
                self.hours.set_hour_slot(_today(), slot.hour, done=True)
        state = self.tasks.get_app_state()
        state.now_task_id = None
        self.tasks.save_app_state(state)
        return self.get()

    def start_hour(self, day: str, hour: int) -> Task:
        """Start the thing you wrote in an hour.

        This is what makes HOURS a place you can work FROM rather than
        only plan in. The entry becomes a real Focus task so it gets the
        machinery every other task already has — one clock at a time, the
        linked project's timer, COMPLETE — and it carries hour_slot_id so
        finishing it ticks the hour back.

        Re-pressing play on the same hour finds the task it made the
        first time (get_by_hour_slot) and refreshes its text, exactly as
        strike_project_task does for a subtask. Editing the hour after
        starting it should not leave a task running under the old
        wording.
        """
        if self.hours is None:
            raise ValueError("Hour plan not available")
        slot = next((s for s in self.hours.hour_slots(day) if s.hour == hour), None)
        if slot is None or not (slot.text or "").strip():
            raise ValueError("Nothing planned in that hour")

        task = self.tasks.get_by_hour_slot(slot.id)
        if task is not None and not task.done:
            task.text = slot.text
            task.day = _today()
            self.tasks.save(task)
        else:
            task = self.tasks.add(
                Task(
                    id=int(time.time() * 1000),
                    list_key="focus",
                    text=slot.text,
                    done=False,
                    secs=0.0,
                    sessions=[],
                    est=0,
                    mit=False,
                    day=_today(),
                    urgency="med",
                    # NOT struck — see the note in get().
                    strike=False,
                    project=None,
                    psrc=None,
                    hour_slot_id=slot.id,
                )
            )

        self.set_now(task.id)
        cur = self.get()
        if cur is not None and not _is_running(cur):
            self.toggle_run()
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

    def strike_goal_task(self, pid: str) -> Task:
        """The goal-task twin of strike_project_task. `project` is only
        set when the goal's owner is a REAL Project row — the reserved
        "life" owner (and any future non-project owner) has none, so
        Task.project's FK would reject it; see Goal.project_key's own
        comment on why "life" is opaque to this engine."""
        if self.goals is None:
            raise ValueError("Goal tasks not available")
        goal_task = self.goals.get_goal_task(pid)
        if goal_task is None:
            raise ValueError("Goal task not found")
        goal = self.goals.get(goal_task.goal_id)
        owner_project = self.projects.get(goal.project_key) if goal else None
        project_key = owner_project.key if owner_project else None

        cur = self.tasks.get_by_gsrc(pid)
        if cur is not None and not cur.done:
            if not cur.strike:
                if len(struck_tasks_in_view(self.tasks)) >= STRIKE_MAX:
                    raise StrikeLimitReached(STRIKE_MAX)
                cur.strike = True
            cur.day = _today()
            cur.project = project_key
            cur.text = goal_task.text
            return self.tasks.save(cur)

        if len(struck_tasks_in_view(self.tasks)) >= STRIKE_MAX:
            raise StrikeLimitReached(STRIKE_MAX)
        task = Task(
            id=int(time.time() * 1000),
            list_key="focus",
            text=goal_task.text,
            done=False,
            secs=0.0,
            sessions=[],
            est=0,
            mit=False,
            day=_today(),
            urgency="med",
            strike=True,
            project=project_key,
            psrc=None,
            gsrc=pid,
        )
        return self.tasks.add(task)
