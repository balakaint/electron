"""Outcome -> Milestone -> Win -> PlanTask planning hierarchy. Progress
at every non-leaf level is ALWAYS derived by walking child rows unless
the node is `fixed` — see the Phase A design spec's locked pseudocode.
No level's compute function ever mentions a specific week/month/year by
name; adding a new Outcome/Milestone/Win/PlanTask needs no change here.
"""

import time
from datetime import date, timedelta

from database.models import ChecklistItem, Milestone, Outcome, PlanTask, Win
from database.repository import PlanningRepository


class ChildrenExistError(Exception):
    def __init__(self, count: int):
        self.count = count
        super().__init__(f"{count} child row(s) exist")


def _today() -> str:
    return str(date.today())


def _apply_achieved_pin(node: Outcome | Milestone | Win, status: str) -> None:
    """Panel 2's tick writes `status`, and this is the one place that
    status has a side effect on progress. Marking a node 'achieved' pins
    it (`fixed=True, progress=100`) so the achieved tick is visible
    everywhere progress is read from (Panel 2's own bar, and every
    Panel 3 level, which all key off `progress === 100` for the
    achieved badge) — before this, ticking 'achieved' only wrote
    `status`, which nothing in win_progress/milestone_progress/
    outcome_progress reads, so the tick was cosmetic in Panel 2 and
    invisible everywhere else (caught in code review). Moving off
    'achieved' un-pins it (`fixed=False`), which hands progress back to
    the normal derived-from-children computation — this is also the
    only write path `fixed` has at all in Phase A, closing that gap
    too, deliberately scoped to "the achieved tick" rather than a bare
    settable field a caller could set unrelated to that.
    """
    node.fixed = status == "achieved"
    if node.fixed:
        node.progress = 100


def win_progress(win: Win, repo: PlanningRepository) -> int:
    if win.fixed:
        return win.progress or 0
    # Dropped tasks are excluded from both numerator and denominator — a
    # task the user has explicitly dropped is resolved, not "still
    # outstanding work this Win is waiting on" (caught in code review:
    # a Win with 1 done + 1 dropped task was stuck at 50%, so dropping
    # the one task you'll never do made the Win's own completion
    # unreachable).
    tasks = [t for t in repo.list_plan_tasks(win.id) if t.status != "dropped"]
    if not tasks:
        return win.progress or 0
    done = sum(1 for t in tasks if t.status == "done")
    return round(100 * done / len(tasks))


def milestone_progress(milestone: Milestone, repo: PlanningRepository) -> int:
    if milestone.fixed:
        return milestone.progress or 0
    wins = repo.list_wins(milestone.id)
    if not wins:
        return milestone.progress or 0
    total = sum(win_progress(w, repo) for w in wins)
    return round(total / len(wins))


def outcome_progress(outcome: Outcome, repo: PlanningRepository) -> int:
    if outcome.fixed:
        return outcome.progress or 0
    milestones = repo.list_milestones(outcome.id)
    if not milestones:
        return outcome.progress or 0
    total = sum(milestone_progress(m, repo) for m in milestones)
    return round(total / len(milestones))


class PlanningEngine:
    def __init__(self, repo: PlanningRepository):
        self.repo = repo

    # ── Outcomes ──────────────────────────────────────────────────────
    def list_outcomes(self, owner_key: str) -> list[dict]:
        return [self._outcome_out(o) for o in self.repo.list_outcomes(owner_key)]

    def create_outcome(self, owner_key: str, title: str, year: int) -> dict:
        title = title.strip()
        if not title:
            raise ValueError("Outcome title cannot be empty")
        outcome = Outcome(id=int(time.time() * 1000), owner_key=owner_key, title=title, year=year)
        return self._outcome_out(self.repo.add_outcome(outcome))

    def edit_outcome(self, outcome_id: int, title: str | None = None, status: str | None = None) -> dict | None:
        outcome = self.repo.get_outcome(outcome_id)
        if outcome is None:
            return None
        if title is not None and title.strip():
            outcome.title = title.strip()
        if status is not None:
            outcome.status = status
            _apply_achieved_pin(outcome, status)
        return self._outcome_out(self.repo.save_outcome(outcome))

    def delete_outcome(self, outcome_id: int, force: bool = False) -> bool:
        outcome = self.repo.get_outcome(outcome_id)
        if outcome is None:
            return False
        count = self.repo.count_milestones(outcome_id)
        if count and not force:
            raise ChildrenExistError(count)
        if force:
            # milestones.outcome_id is ondelete="RESTRICT" (deliberately —
            # see the model's own docstring), so force must cascade
            # explicitly here rather than relying on the FK to do it.
            for milestone in self.repo.list_milestones(outcome_id):
                self.delete_milestone(milestone.id, force=True)
        self.repo.delete_outcome(outcome)
        return True

    # ── Milestones ────────────────────────────────────────────────────
    def list_milestones(self, outcome_id: int) -> list[dict]:
        return [self._milestone_out(m) for m in self.repo.list_milestones(outcome_id)]

    def create_milestone(self, outcome_id: int, title: str, month: int, year: int) -> dict:
        title = title.strip()
        if not title:
            raise ValueError("Milestone title cannot be empty")
        if self.repo.get_outcome(outcome_id) is None:
            raise ValueError(f"no outcome {outcome_id}")
        milestone = Milestone(id=int(time.time() * 1000), outcome_id=outcome_id, title=title, month=month, year=year)
        return self._milestone_out(self.repo.add_milestone(milestone))

    def edit_milestone(
        self, milestone_id: int, title: str | None = None, status: str | None = None, outcome_id: int | None = None
    ) -> dict | None:
        milestone = self.repo.get_milestone(milestone_id)
        if milestone is None:
            return None
        if title is not None and title.strip():
            milestone.title = title.strip()
        if status is not None:
            milestone.status = status
            _apply_achieved_pin(milestone, status)
        if outcome_id is not None:
            # Re-parent fix-up; children stay linked via their own FK,
            # never touched here. A stale/wrong id must not silently
            # no-op — caught in code review: it previously fell through
            # to a 200 with the row unchanged, which reads to the caller
            # as a successful move that didn't happen.
            if self.repo.get_outcome(outcome_id) is None:
                raise ValueError(f"no outcome {outcome_id}")
            milestone.outcome_id = outcome_id
        return self._milestone_out(self.repo.save_milestone(milestone))

    def delete_milestone(self, milestone_id: int, force: bool = False) -> bool:
        milestone = self.repo.get_milestone(milestone_id)
        if milestone is None:
            return False
        count = self.repo.count_wins(milestone_id)
        if count and not force:
            raise ChildrenExistError(count)
        if force:
            # wins.milestone_id is ondelete="RESTRICT" — same reasoning
            # as delete_outcome's own force branch.
            for win in self.repo.list_wins(milestone_id):
                self.delete_win(win.id, force=True)
        self.repo.delete_milestone(milestone)
        return True

    # ── Wins ──────────────────────────────────────────────────────────
    def list_wins(self, milestone_id: int) -> list[dict]:
        return [self._win_out(w) for w in self.repo.list_wins(milestone_id)]

    def create_win(self, milestone_id: int, title: str, week_start_date: str, criteria: str = "") -> dict:
        title = title.strip()
        if not title:
            raise ValueError("Win title cannot be empty")
        if self.repo.get_milestone(milestone_id) is None:
            raise ValueError(f"no milestone {milestone_id}")
        win = Win(id=int(time.time() * 1000), milestone_id=milestone_id, title=title, week_start_date=week_start_date, criteria=criteria.strip())
        return self._win_out(self.repo.add_win(win))

    def edit_win(
        self,
        win_id: int,
        title: str | None = None,
        criteria: str | None = None,
        status: str | None = None,
        milestone_id: int | None = None,
    ) -> dict | None:
        win = self.repo.get_win(win_id)
        if win is None:
            return None
        if title is not None and title.strip():
            win.title = title.strip()
        if criteria is not None:
            win.criteria = criteria.strip()
        if status is not None:
            win.status = status
            _apply_achieved_pin(win, status)
        if milestone_id is not None:
            if self.repo.get_milestone(milestone_id) is None:
                raise ValueError(f"no milestone {milestone_id}")
            win.milestone_id = milestone_id
        return self._win_out(self.repo.save_win(win))

    def delete_win(self, win_id: int, force: bool = False) -> bool:
        win = self.repo.get_win(win_id)
        if win is None:
            return False
        count = self.repo.count_plan_tasks(win_id)
        if count and not force:
            raise ChildrenExistError(count)
        self.repo.delete_win(win)
        return True

    # ── Plan tasks ────────────────────────────────────────────────────
    def create_plan_task(self, owner_key: str, title: str, win_id: int | None = None, scheduled_date: str | None = None) -> dict:
        title = title.strip()
        if not title:
            raise ValueError("Task title cannot be empty")
        task = PlanTask(id=int(time.time() * 1000), win_id=win_id, title=title, scheduled_date=scheduled_date, owner_key=owner_key)
        return self._plan_task_out(self.repo.add_plan_task(task))

    def edit_plan_task(self, task_id: int, title: str | None = None, status: str | None = None) -> dict | None:
        task = self.repo.get_plan_task(task_id)
        if task is None:
            return None
        if title is not None and title.strip():
            task.title = title.strip()
        if status is not None:
            task.status = status
        return self._plan_task_out(self.repo.save_plan_task(task))

    def schedule_plan_task(self, task_id: int, scheduled_date: str | None, win_id: int | None) -> dict | None:
        task = self.repo.get_plan_task(task_id)
        if task is None:
            return None
        task.scheduled_date = scheduled_date
        task.win_id = win_id
        return self._plan_task_out(self.repo.save_plan_task(task))

    def carry_forward_plan_task(self, task_id: int, action: str) -> dict | None:
        """action: 'nextweek' | 'date' (Phase A: aliases to 'nextweek',
        see the design spec's Carry Forward edge case) | 'backlog' | 'drop'.

        'nextweek'/'date' re-point win_id at the real Win for next week
        when one exists (found via `find_win_by_owner_and_week`), or
        detach to backlog (win_id=None) when none does — caught in code
        review: the previous version only shifted `scheduled_date` and
        left `win_id` on the OLD Win, so the task never actually left
        the list it was supposedly carried forward out of.
        """
        task = self.repo.get_plan_task(task_id)
        if task is None:
            return None
        if action in ("nextweek", "date"):
            if task.win_id is not None:
                win = self.repo.get_win(task.win_id)
                if win is not None:
                    next_week_start = str(date.fromisoformat(win.week_start_date) + timedelta(days=7))
                    if task.scheduled_date:
                        task.scheduled_date = str(date.fromisoformat(task.scheduled_date) + timedelta(days=7))
                    target = self.repo.find_win_by_owner_and_week(task.owner_key, next_week_start)
                    task.win_id = target.id if target else None
            elif task.scheduled_date:
                task.scheduled_date = str(date.fromisoformat(task.scheduled_date) + timedelta(days=7))
        elif action == "backlog":
            task.win_id = None
            task.scheduled_date = None
        elif action == "drop":
            task.status = "dropped"
        return self._plan_task_out(self.repo.save_plan_task(task))

    def delete_plan_task(self, task_id: int) -> bool:
        task = self.repo.get_plan_task(task_id)
        if task is None:
            return False
        self.repo.delete_plan_task(task)
        return True

    # ── Checklist items ───────────────────────────────────────────────
    def add_checklist_item(
        self, text: str, *, outcome_id: int | None = None, milestone_id: int | None = None, win_id: int | None = None
    ) -> ChecklistItem:
        text = text.strip()
        if not text:
            raise ValueError("Checklist item text cannot be empty")
        parents = [p for p in (outcome_id, milestone_id, win_id) if p is not None]
        if len(parents) != 1:
            raise ValueError("exactly one of outcome_id/milestone_id/win_id must be set")
        pid = f"p{parents[0]}:{int(time.time() * 1000)}"
        item = ChecklistItem(
            pid=pid, text=text, done=False, added_date=_today(),
            outcome_id=outcome_id, milestone_id=milestone_id, win_id=win_id,
        )
        return self.repo.add_checklist_item(item)

    def toggle_checklist_item(self, pid: str) -> ChecklistItem | None:
        item = self.repo.get_checklist_item(pid)
        if item is None:
            return None
        item.done = not item.done
        return self.repo.save_checklist_item(item)

    def delete_checklist_item(self, pid: str) -> bool:
        item = self.repo.get_checklist_item(pid)
        if item is None:
            return False
        self.repo.delete_checklist_item(item)
        return True

    # ── Serialization (progress always resolved server-side) ─────────
    def _outcome_out(self, outcome: Outcome) -> dict:
        return {
            "id": outcome.id, "owner_key": outcome.owner_key, "title": outcome.title, "year": outcome.year,
            "status": outcome.status, "fixed": outcome.fixed, "progress": outcome_progress(outcome, self.repo),
            "legacy_goal_id": outcome.legacy_goal_id,
        }

    def _milestone_out(self, milestone: Milestone) -> dict:
        return {
            "id": milestone.id, "outcome_id": milestone.outcome_id, "title": milestone.title,
            "month": milestone.month, "year": milestone.year, "status": milestone.status,
            "fixed": milestone.fixed, "progress": milestone_progress(milestone, self.repo),
            "legacy_goal_id": milestone.legacy_goal_id,
        }

    def _win_out(self, win: Win) -> dict:
        return {
            "id": win.id, "milestone_id": win.milestone_id, "title": win.title,
            "week_start_date": win.week_start_date, "criteria": win.criteria, "status": win.status,
            "fixed": win.fixed, "progress": win_progress(win, self.repo), "legacy_goal_id": win.legacy_goal_id,
        }

    def _plan_task_out(self, task: PlanTask) -> dict:
        return {
            "id": task.id, "win_id": task.win_id, "title": task.title,
            "scheduled_date": task.scheduled_date, "status": task.status, "owner_key": task.owner_key,
        }
