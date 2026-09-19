import time

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database.models import BOARD_COLS, BOARD_PRIORITIES, BoardCard, BoardTask
from database.repository import BoardCardRepository, BoardTaskRepository
from engine.timer_reconciliation import open_session, stop_task_session

# INDIVIDUAL TASK BOARD — Goal -> Task -> that Task's own 3-column kanban.
#
# Superseded design note: this used to be one flat per-project "Focus
# Board" (a single BoardEngine scoped by project_key, with an optional
# goal_id backlink on each card — see the dropped `48d822248fb2`
# migration). The user corrected that: a Goal breaks into several
# Tasks, and each Task gets its OWN separate board, not one shared
# board grouped by goal. So the hierarchy is now:
#
#   Goal -> BoardTask (1..N) -> BoardCard (QUEUED/FOCUS/CLOSED)
#
# BoardTaskEngine manages the middle tier (the Task list under a Goal).
# BoardEngine (renamed in spirit from "the project's board" to "one
# task's board") keeps the exact card contract ported from the
# standalone `ele kanban` Electron pilot (see its README's "Public
# operations" table: add_card/move_card/toggle_pin/delete_card/
# cards_in — pinned first, then by id), just re-scoped to task_id
# instead of project_key.


class BoardTaskEngine:
    def __init__(self, repo: BoardTaskRepository):
        self.repo = repo

    def tasks_in(self, goal_id: int) -> list[dict]:
        return [self._task_out(t) for t in self.repo.list(goal_id)]

    def add_task(self, goal_id: int, title: str) -> dict:
        title = title.strip()
        if not title:
            raise ValueError("Task title cannot be empty")
        task = BoardTask(id=int(time.time() * 1000), goal_id=goal_id, title=title)
        return self._task_out(self.repo.add(task))

    def edit_task(
        self,
        task_id: int,
        title: str | None = None,
        outcome: str | None = None,
        next_action: str | None = None,
    ) -> dict | None:
        task = self.repo.get(task_id)
        if task is None:
            return None
        if title is not None and title.strip():
            task.title = title.strip()
        if outcome is not None:
            task.outcome = outcome.strip()
        if next_action is not None:
            task.next_action = next_action.strip()
        return self._task_out(self.repo.save(task))

    def delete_task(self, task_id: int) -> bool:
        task = self.repo.get(task_id)
        if task is None:
            return False
        self.repo.delete(task)  # cascades to the task's cards (ondelete="CASCADE")
        return True

    @staticmethod
    def _task_out(task: BoardTask) -> dict:
        return {
            "id": task.id,
            "goal_id": task.goal_id,
            "title": task.title,
            "outcome": task.outcome,
            "next_action": task.next_action,
        }


def goal_board_progress(db: Session, goal_id: int) -> tuple[int, int, int]:
    """(done, focus, total) card counts across EVERY Individual Task
    Board that belongs to this goal — i.e. every BoardCard whose task's
    goal_id matches. Lives here rather than as a GoalEngine method: it
    reads board_tasks/board_cards, not goals, and GoalEngine has no
    reason to depend on the board tables just to answer "how many goals
    exist" — most goals never open a Board at all. A raw multi-query
    aggregate (task ids for the goal, then grouped counts of their
    cards) rather than an ORM join, since this is a read-only count with
    no need for hydrated BoardCard objects.

    total == 0 means "this goal has no board data" — the caller (the
    /goals routes) treats that as absent, not as 0%. `focus` (added
    alongside GoalBoardOverlay's progress steps) is what tells "Actions"
    apart from "Plans" — total > 0 alone can't, since a goal with
    everything still sitting in QUEUED has total > 0 but nothing
    actually in focus yet."""
    task_ids = list(db.scalars(select(BoardTask.id).where(BoardTask.goal_id == goal_id)))
    if not task_ids:
        return (0, 0, 0)
    total = db.scalar(select(func.count()).select_from(BoardCard).where(BoardCard.task_id.in_(task_ids))) or 0
    done = (
        db.scalar(
            select(func.count())
            .select_from(BoardCard)
            .where(BoardCard.task_id.in_(task_ids), BoardCard.col == "done")
        )
        or 0
    )
    focus = (
        db.scalar(
            select(func.count())
            .select_from(BoardCard)
            .where(BoardCard.task_id.in_(task_ids), BoardCard.col == "focus")
        )
        or 0
    )
    return (done, focus, total)


def goal_top_focus_card_title(db: Session, goal_id: int) -> str | None:
    """The title of this goal's own "top" FOCUS card — same ordering
    BoardCardRepository.list already uses within one task's board
    (pinned first, then oldest by id), just applied across EVERY task
    under the goal instead of one task's board at a time, since a goal
    has no board of its own. Added 2026-09-16 so GoalsPanel's NEXT
    ACTION field can default to "whatever's actually in focus on the
    board" (Zahid: "next action by default its board 1st focused 1st
    card name") instead of sitting empty until someone types into it.

    None when no task under this goal has anything in FOCUS — the
    caller then falls back to the field's own example placeholder,
    same as before this existed."""
    task_ids = list(db.scalars(select(BoardTask.id).where(BoardTask.goal_id == goal_id)))
    if not task_ids:
        return None
    title = db.scalar(
        select(BoardCard.title)
        .where(BoardCard.task_id.in_(task_ids), BoardCard.col == "focus")
        .order_by(BoardCard.pinned.desc(), BoardCard.id)
        .limit(1)
    )
    return title


class BoardEngine:
    def __init__(self, repo: BoardCardRepository):
        self.repo = repo

    def cards_in(self, task_id: int) -> list[dict]:
        return [self._card_out(c) for c in self.repo.list(task_id)]

    def add_card(
        self,
        task_id: int,
        col: str,
        title: str,
        note: str = "",
        priority: str = "normal",
    ) -> dict:
        title = title.strip()
        if not title:
            raise ValueError("Card title cannot be empty")
        if col not in BOARD_COLS:
            raise ValueError(f"col must be one of {BOARD_COLS}")
        if priority not in BOARD_PRIORITIES:
            raise ValueError(f"priority must be one of {BOARD_PRIORITIES}")
        card = BoardCard(
            id=int(time.time() * 1000),
            task_id=task_id,
            col=col,
            title=title,
            note=note.strip(),
            priority=priority,
            pinned=False,
        )
        return self._card_out(self.repo.add(card))

    def move_card(self, card_id: int, new_col: str) -> dict | None:
        if new_col not in BOARD_COLS:
            raise ValueError(f"col must be one of {BOARD_COLS}")
        card = self.repo.get(card_id)
        if card is None:
            return None
        # Leaving FOCUS auto-stops an open timer — a card sitting in
        # QUEUED or CLOSED with a clock silently still running would be
        # a real accuracy bug now that the timer means something (not
        # the old ele kanban pilot's cosmetic countdown, which had
        # nothing to get wrong).
        if card.col == "focus" and new_col != "focus" and open_session(card) is not None:
            idle_limit_secs = self.repo.get_app_state().idle_stop_min * 60
            stop_task_session(card, idle_limit_secs=idle_limit_secs)
        card.col = new_col
        return self._card_out(self.repo.save(card))

    def toggle_timer(self, card_id: int) -> dict | None:
        """START / PAUSE this card's own timer. Deliberately no
        exclusivity rule — unlike NOW's single-running-task constraint,
        this mirrors Task's own per-task timers, which already run
        concurrently with each other (see engine.now.NowEngine.toggle_run's
        own comment on that distinction)."""
        card = self.repo.get(card_id)
        if card is None:
            return None
        idle_limit_secs = self.repo.get_app_state().idle_stop_min * 60
        if open_session(card) is not None:
            stop_task_session(card, idle_limit_secs=idle_limit_secs)
        else:
            sessions = list(card.sessions or [])
            sessions.append({"start": time.time(), "end": None})
            card.sessions = sessions
        return self._card_out(self.repo.save(card))

    def stop_all_running(self) -> int:
        """Close every open card session and return how many were
        closed — called on app shutdown, same reason and same bug this
        prevents as TaskEngine.stop_all_running (see that method's own
        docstring): a session left open at quit is still open on the
        next launch, and startup reconciliation would otherwise credit
        the whole time the app was closed."""
        closed = 0
        idle_limit_secs = self.repo.get_app_state().idle_stop_min * 60
        for card in self.repo.list_all():
            if open_session(card) is not None:
                stop_task_session(card, idle_limit_secs=idle_limit_secs)
                self.repo.save(card)
                closed += 1
        return closed

    def toggle_pin(self, card_id: int) -> dict | None:
        card = self.repo.get(card_id)
        if card is None:
            return None
        card.pinned = not card.pinned
        return self._card_out(self.repo.save(card))

    def edit_card(
        self,
        card_id: int,
        title: str | None = None,
        note: str | None = None,
        priority: str | None = None,
    ) -> dict | None:
        card = self.repo.get(card_id)
        if card is None:
            return None
        if title is not None and title.strip():
            card.title = title.strip()
        if note is not None:
            card.note = note.strip()
        if priority is not None:
            if priority not in BOARD_PRIORITIES:
                raise ValueError(f"priority must be one of {BOARD_PRIORITIES}")
            card.priority = priority
        return self._card_out(self.repo.save(card))

    def delete_card(self, card_id: int) -> bool:
        card = self.repo.get(card_id)
        if card is None:
            return False
        self.repo.delete(card)
        return True

    @staticmethod
    def _card_out(card: BoardCard) -> dict:
        return {
            "id": card.id,
            "task_id": card.task_id,
            "col": card.col,
            "title": card.title,
            "note": card.note,
            "priority": card.priority,
            "pinned": card.pinned,
            "secs": card.secs,
            "sessions": card.sessions,
        }
