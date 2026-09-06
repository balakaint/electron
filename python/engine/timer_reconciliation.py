"""Shared timer-safety design for both project and task timers.

Three legacy behaviors this replaces (see task_tracker_v3_THEMES.py):
  - `_rollover_day` (2986-3042): zeroes a project timer left running
    overnight rather than letting it quietly bank hours against the
    wrong day.
  - `_toggle_project_timer` (2715-2755): only one project timer can run
    at a time — starting one always closes any other first.
  - `_close_project_session` / idle check in `_tick` (2579-2606,
    2699-2708, 10190-10203): a project timer force-stops and refunds
    the idle stretch after 15 minutes of inactivity.

The legacy app gets all three for free because it credits `secs` on a
live 50ms tick, not at stop time. This REST engine has no live tick, so
a stale `running_since` (Project) or open session `start` (Task)
surviving an engine restart would otherwise let one late stop/tick
credit the *entire* downtime as worked time. The fix: treat every call
site (explicit start/stop, engine startup, the periodic scheduler) as a
"tick" that credits elapsed time since the last checkpoint, capping any
single gap at IDLE_LIMIT_SECS — normal 1-minute scheduler gaps never
trip the cap, so a real multi-hour session survives a later crash with
at most ~1 minute lost, while a stale timer left over from a crash
loses only the idle tail instead of gaining hours of bogus credit.

No schema migration needed: `Project.running_since` is repurposed as a
rolling checkpoint (not the original start), and a task's checkpoint
lives as an extra "checkpoint" key inside its already-JSON `sessions`
blob, alongside the untouched, historically-accurate "start".
"""

import time
from datetime import date, datetime
from datetime import time as dtime
from datetime import timedelta

from database.models import Project, Task
from database.repository import ProjectRepository, TaskRepository

IDLE_LIMIT_SECS = 15 * 60  # fallback default; real value lives in AppState.idle_stop_min


def _resolve_idle_limit(repo: ProjectRepository | TaskRepository, idle_limit_secs: int | None) -> int:
    """Settings-backed idle limit, resolved once per outer call and
    threaded down explicitly from there — avoids an AppState lookup on
    every recursive/looped call (reconcile_all_* over every running
    project/open task, start_project's stop-every-other loop, etc)."""
    if idle_limit_secs is not None:
        return idle_limit_secs
    return repo.get_app_state().idle_stop_min * 60


# ── Projects ─────────────────────────────────────────────────────────

def _credit_project_span(repo: ProjectRepository, key: str, start_ts: float, end_ts: float) -> None:
    """Split [start_ts, end_ts) across calendar-day boundaries, crediting
    each day's share to that day's ProjectActivity row — matches
    _proj_add_secs being called every tick with "today" evaluated live,
    so a span crossing midnight lands partly in each day instead of
    being dumped entirely on the day the timer happens to stop."""
    cur = start_ts
    while cur < end_ts:
        day = datetime.fromtimestamp(cur).date()
        next_midnight = datetime.combine(day + timedelta(days=1), dtime.min).timestamp()
        chunk_end = min(end_ts, next_midnight)
        row = repo.get_or_create_activity(key, str(day))
        row.secs = max(0.0, row.secs + (chunk_end - cur))
        repo.save_activity(row)
        cur = chunk_end


def _credit_elapsed(repo: ProjectRepository, project: Project, now: float, idle_limit_secs: int) -> bool:
    """Credit elapsed time since running_since up to now, capping the
    credited span at idle_limit_secs (any excess is refunded/discarded,
    never persisted). Returns True if the gap exceeded the idle limit.
    Does not touch running_since — the caller decides whether to
    checkpoint it forward or clear it."""
    start = project.running_since
    gap = now - start
    if gap <= 0:
        return False
    credit_end = min(now, start + idle_limit_secs)
    _credit_project_span(repo, project.key, start, credit_end)
    return gap > idle_limit_secs


def tick_project(
    repo: ProjectRepository, project: Project, now: float | None = None, idle_limit_secs: int | None = None
) -> None:
    """Periodic/startup reconciliation for a running project: checkpoint
    running_since forward if still within the idle window (so the next
    tick measures from here), or auto-stop if idle was detected —
    matches the legacy idle auto-stop-with-refund. No-ops if not running."""
    if project.running_since is None:
        return
    now = time.time() if now is None else now
    idle_limit_secs = _resolve_idle_limit(repo, idle_limit_secs)
    was_idle = _credit_elapsed(repo, project, now, idle_limit_secs)
    project.running_since = None if was_idle else now


def stop_project(
    repo: ProjectRepository, project: Project, now: float | None = None, idle_limit_secs: int | None = None
) -> None:
    """Explicit stop: credit elapsed (still capped+refunded if the timer
    had gone idle before the user got back to click stop), always clears
    running_since. No-ops if not running."""
    if project.running_since is None:
        return
    now = time.time() if now is None else now
    idle_limit_secs = _resolve_idle_limit(repo, idle_limit_secs)
    _credit_elapsed(repo, project, now, idle_limit_secs)
    project.running_since = None


def start_project(
    repo: ProjectRepository, project: Project, now: float | None = None, idle_limit_secs: int | None = None
) -> None:
    """Enforce single-running-project exclusivity — matches
    _toggle_project_timer, which always closes any other running
    project's session (crediting its real elapsed time) before starting
    a new one — then starts this project's timer."""
    now = time.time() if now is None else now
    idle_limit_secs = _resolve_idle_limit(repo, idle_limit_secs)
    for other in repo.list_running_projects():
        if other.key != project.key:
            stop_project(repo, other, now, idle_limit_secs)
            repo.save(other)
    project.running_since = now


def reconcile_all_projects(repo: ProjectRepository, idle_limit_secs: int | None = None) -> None:
    """Called at engine startup and on every periodic scheduler tick."""
    idle_limit_secs = _resolve_idle_limit(repo, idle_limit_secs)
    for project in repo.list_running_projects():
        tick_project(repo, project, idle_limit_secs=idle_limit_secs)
        repo.save(project)


# ── Tasks ────────────────────────────────────────────────────────────

def _open_session(task: Task) -> dict | None:
    sessions = task.sessions or []
    if sessions and sessions[-1].get("end") is None:
        return sessions[-1]
    return None


def tick_task(task: Task, now: float | None = None, idle_limit_secs: int = IDLE_LIMIT_SECS) -> None:
    """Periodic/startup reconciliation for a task with an open session:
    credits elapsed since the last checkpoint into `secs`, capped at
    idle_limit_secs per tick, then checkpoints forward. Never auto-stops
    — legacy never idle-stops a task timer either, multiple task timers
    can run concurrently, and this just prevents a stale open session
    from crediting an entire engine-downtime gap as worked time.

    Takes a plain int (not a repo) — unlike the project-side functions,
    this has no repo to self-resolve the setting from, so callers that
    have one (reconcile_all_tasks, stop_task_and_project) resolve it
    once and pass it down; a bare call falls back to the same default
    IDLE_LIMIT_SECS the settings row itself defaults to."""
    last = _open_session(task)
    if last is None:
        return
    now = time.time() if now is None else now
    checkpoint = last.get("checkpoint", last["start"])
    gap = now - checkpoint
    if gap <= 0:
        return
    sessions = list(task.sessions)
    last = dict(last)
    task.secs = (task.secs or 0.0) + min(gap, idle_limit_secs)
    last["checkpoint"] = now
    sessions[-1] = last
    task.sessions = sessions


def stop_task_session(task: Task, now: float | None = None, idle_limit_secs: int = IDLE_LIMIT_SECS) -> None:
    """Close the open session, crediting elapsed since the last
    checkpoint (capped at the idle limit, same as projects — so a
    session left open across a crash+restart doesn't credit the whole
    downtime on the next explicit stop). See tick_task's docstring for
    why this takes a plain int rather than resolving it internally."""
    last = _open_session(task)
    if last is None:
        return
    now = time.time() if now is None else now
    checkpoint = last.get("checkpoint", last["start"])
    credited = max(0.0, min(now - checkpoint, idle_limit_secs))
    sessions = list(task.sessions)
    last = dict(last)
    last["end"] = now
    last.pop("checkpoint", None)
    sessions[-1] = last
    task.secs = (task.secs or 0.0) + credited
    task.sessions = sessions


def reconcile_all_tasks(repo: TaskRepository, idle_limit_secs: int | None = None) -> None:
    """Called at engine startup and on every periodic scheduler tick."""
    idle_limit_secs = _resolve_idle_limit(repo, idle_limit_secs)
    for task in repo.list():
        if _open_session(task) is not None:
            tick_task(task, idle_limit_secs=idle_limit_secs)
            repo.save(task)


def stop_task_and_project(
    task_repo: TaskRepository, project_repo: ProjectRepository, task: Task, idle_limit_secs: int | None = None
) -> None:
    """Stop a task's clock and, if it belongs to a project, that
    project's clock with it — they only ever start together (see
    engine.now.NowEngine.toggle_run), so they must stop together or the
    project keeps banking time for work that has stopped.

    This is the fix for the bug legacy documents at _toggle_strike:
    un-starring a task whose own clock was running used to leave the
    project's clock running too, invisibly — the task disappears from
    both NOW and the strike list, the only two places with a stop
    button, while the project quietly keeps recording. Also used by
    NOW's own pause/complete actions."""
    idle_limit_secs = _resolve_idle_limit(task_repo, idle_limit_secs)
    if _open_session(task) is not None:
        stop_task_session(task, idle_limit_secs=idle_limit_secs)
        task_repo.save(task)
    if task.project:
        project = project_repo.get(task.project)
        if project is not None and project.running_since is not None:
            stop_project(project_repo, project, idle_limit_secs=idle_limit_secs)
            project_repo.save(project)
