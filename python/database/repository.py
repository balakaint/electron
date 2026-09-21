from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database.models import (
    AppState,
    BdpAction,
    BdpPlan,
    BoardCard,
    BoardTask,
    BusinessAnalysis,
    CirclePerson,
    DailyIntention,
    DecisionLog,
    Goal,
    HourSlot,
    JourneyLogEntry,
    JourneyStage,
    JourneyTask,
    LegacyAnalysisBox,
    MorningRitual,
    NightClosure,
    Project,
    ProjectActivity,
    ProjectJourney,
    ProjectSubtask,
    Q90AreaMeta,
    QuarterlyAnswer,
    Task,
)


class TaskRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(self, list_key: str | None = None) -> list[Task]:
        stmt = select(Task).order_by(Task.sort_order)
        if list_key is not None:
            stmt = stmt.where(Task.list_key == list_key)
        return list(self.db.scalars(stmt))

    def get(self, task_id: int) -> Task | None:
        return self.db.get(Task, task_id)

    def add(self, task: Task) -> Task:
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task

    def delete(self, task: Task) -> None:
        # Un-link the NOW pointer before deleting, same reasoning as
        # ProjectRepository.delete_subtask nulling Task.psrc: a real FK
        # would otherwise raise IntegrityError, and a dangling reference
        # left in place would point at nothing.
        state = self.db.get(AppState, 1)
        if state is not None and state.now_task_id == task.id:
            state.now_task_id = None
        self.db.delete(task)
        self.db.commit()

    def save(self, task: Task) -> Task:
        self.db.commit()
        self.db.refresh(task)
        return task

    def list_struck(self) -> list[Task]:
        """Today's committed Focus tasks, in list/insertion order —
        matches _strike_tasks, which explicitly reads tasks_focus only,
        never the Plan list. Ordered by id (a ms-timestamp) so NOW's
        "first unfinished struck task" derivation is deterministic
        rather than relying on SQLite's incidental row order."""
        stmt = select(Task).where(Task.list_key == "focus", Task.strike.is_(True)).order_by(Task.id)
        return list(self.db.scalars(stmt))

    def get_by_psrc(self, pid: str) -> Task | None:
        """The live Focus task promoted from project-subtask row `pid`,
        if any — matches _pt_committed."""
        stmt = select(Task).where(Task.psrc == pid)
        return self.db.scalars(stmt).first()

    def get_by_hour_slot(self, slot_id: int) -> Task | None:
        """The live Focus task started from hour-plan row `slot_id`, if
        any. Same shape as get_by_psrc and for the same reason: pressing
        play twice on one hour must find the task it made the first
        time, not stack up a second copy with its own clock."""
        stmt = select(Task).where(Task.hour_slot_id == slot_id)
        return self.db.scalars(stmt).first()

    def get_app_state(self) -> AppState:
        return _get_app_state(self.db)

    def save_app_state(self, state: AppState) -> AppState:
        return _save_app_state(self.db, state)


def _get_app_state(db: Session) -> AppState:
    state = db.get(AppState, 1)
    if state is None:
        # Defensive only — the migration always seeds this row.
        state = AppState(id=1, last_strike_reset_day=None)
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


def _save_app_state(db: Session, state: AppState) -> AppState:
    db.commit()
    db.refresh(state)
    return state


class MindsetRepository:
    """Backs only PlanReview.tsx's Mindset tab now. Was `HabitRepository`
    — also backed the flat Money/Health/Relation/Mind checklist and the
    Win/Reflection/Intention daily notes, all removed 2026-09-14 (Zahid:
    "emon task list mainly regular chek kora hoy na"). Renamed rather
    than left as a misleading name on a mindset-only class."""

    def __init__(self, db: Session):
        self.db = db

    def get_journal(self, day: str) -> DailyIntention | None:
        return self.db.get(DailyIntention, day)

    def set_mindset(self, day: str, text: str) -> DailyIntention:
        row = self.db.get(DailyIntention, day)
        if row is None:
            row = DailyIntention(day=day, mindset=text)
            self.db.add(row)
        else:
            row.mindset = text
        self.db.commit()
        self.db.refresh(row)
        return row

    def mindset_history(self, days: list[str]) -> dict[str, str]:
        """The mindset note for each of `days` that has a non-empty one.

        Returned as a dict rather than a list so the caller can ask for a
        fixed window and let the gaps fall out — legacy's own loop skips
        a day with no text rather than printing an empty row, because a
        run of blank lines reads as a broken widget, not as "you didn't
        write anything on Tuesday".
        """
        if not days:
            return {}
        rows = (
            self.db.query(DailyIntention)
            .filter(DailyIntention.day.in_(days))
            .all()
        )
        return {r.day: r.mindset for r in rows if (r.mindset or "").strip()}

    def set_design_today(self, day: str, text: str) -> DailyIntention:
        row = self.db.get(DailyIntention, day)
        if row is None:
            row = DailyIntention(day=day, design_today=text)
            self.db.add(row)
        else:
            row.design_today = text
        self.db.commit()
        self.db.refresh(row)
        return row


class ProjectRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_app_state(self) -> AppState:
        """AppState is genuinely global, not Task-owned (see its
        docstring) — exposed here too so project-timer code
        (engine.timer_reconciliation) can read idle_stop_min without
        needing a TaskRepository just for that."""
        return _get_app_state(self.db)

    def save_app_state(self, state: AppState) -> AppState:
        return _save_app_state(self.db, state)

    # ── Projects ──────────────────────────────────────────────────────
    def list(self) -> list[Project]:
        return list(self.db.scalars(select(Project).order_by(Project.key)))

    def get(self, key: str) -> Project | None:
        return self.db.get(Project, key)

    def list_running_projects(self) -> list[Project]:
        stmt = select(Project).where(Project.running_since.isnot(None))
        return list(self.db.scalars(stmt))

    def save(self, project: Project) -> Project:
        self.db.commit()
        self.db.refresh(project)
        return project

    # ── Subtasks ──────────────────────────────────────────────────────
    def list_subtasks(self, project_key: str) -> list[ProjectSubtask]:
        stmt = select(ProjectSubtask).where(ProjectSubtask.project_key == project_key)
        return list(self.db.scalars(stmt))

    def get_subtask(self, pid: str) -> ProjectSubtask | None:
        return self.db.get(ProjectSubtask, pid)

    def add_subtask(self, subtask: ProjectSubtask) -> ProjectSubtask:
        self.db.add(subtask)
        self.db.commit()
        self.db.refresh(subtask)
        return subtask

    def save_subtask(self, subtask: ProjectSubtask) -> ProjectSubtask:
        self.db.commit()
        self.db.refresh(subtask)
        return subtask

    def delete_subtask(self, subtask: ProjectSubtask) -> None:
        """Unlink any Task still pointing at this subtask via psrc before
        deleting it. Legacy allows deleting a subtask a Focus task still
        references — the reference just goes dangling and is silently
        ignored everywhere it's read. Task.psrc is a real FK here (see
        models.py), so SQLite would raise IntegrityError instead of
        allowing that; explicitly nulling psrc first reproduces the same
        "orphaned but otherwise untouched" outcome without a dangling
        FK value."""
        orphaned = self.db.scalars(select(Task).where(Task.psrc == subtask.pid))
        for task in orphaned:
            task.psrc = None
        self.db.delete(subtask)
        self.db.commit()

    # ── Daily activity (timer + manual mark) ─────────────────────────
    def get_activity(self, project_key: str, day: str) -> ProjectActivity | None:
        stmt = select(ProjectActivity).where(
            ProjectActivity.project_key == project_key, ProjectActivity.day == day
        )
        return self.db.scalars(stmt).first()

    def activity_range(self, project_key: str, days: list[str]) -> dict[str, ProjectActivity]:
        stmt = select(ProjectActivity).where(
            ProjectActivity.project_key == project_key, ProjectActivity.day.in_(days)
        )
        return {a.day: a for a in self.db.scalars(stmt)}

    def activity_range_all(self, project_keys: list[str], days: list[str]) -> dict[str, float]:
        """Summed secs per day across the given projects — the Deep Work
        Trend chart's data source, one query rather than one per
        project. Matches legacy's per-day sum over _named_projects()."""
        if not project_keys or not days:
            return {}
        stmt = select(ProjectActivity.day, ProjectActivity.secs).where(
            ProjectActivity.project_key.in_(project_keys), ProjectActivity.day.in_(days)
        )
        totals: dict[str, float] = {}
        for day, secs in self.db.execute(stmt):
            totals[day] = totals.get(day, 0.0) + secs
        return totals

    def earliest_activity_day(self, project_keys: list[str]) -> str | None:
        """First day any of these projects has a real activity row —
        matches legacy's start_date clip: never plot days from before
        real use began, since those are unmeasured, not zero-hour."""
        if not project_keys:
            return None
        stmt = select(func.min(ProjectActivity.day)).where(ProjectActivity.project_key.in_(project_keys))
        return self.db.scalar(stmt)

    def get_or_create_activity(self, project_key: str, day: str) -> ProjectActivity:
        row = self.get_activity(project_key, day)
        if row is None:
            row = ProjectActivity(project_key=project_key, day=day, secs=0.0, manual_mark=False)
            self.db.add(row)
            self.db.flush()
        return row

    def save_activity(self, activity: ProjectActivity) -> ProjectActivity:
        self.db.commit()
        self.db.refresh(activity)
        return activity

    # ── Accountability circle ────────────────────────────────────────
    def list_people(self, project_key: str | None) -> list[CirclePerson]:
        stmt = select(CirclePerson).where(CirclePerson.project_key == project_key)
        return list(self.db.scalars(stmt))

    def get_person(self, person_id: int) -> CirclePerson | None:
        return self.db.get(CirclePerson, person_id)

    def add_person(self, person: CirclePerson) -> CirclePerson:
        self.db.add(person)
        self.db.commit()
        self.db.refresh(person)
        return person

    def save_person(self, person: CirclePerson) -> CirclePerson:
        self.db.commit()
        self.db.refresh(person)
        return person

    def delete_person(self, person: CirclePerson) -> None:
        self.db.delete(person)
        self.db.commit()


class GoalRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(self, project_key: str, horizon: str | None = None) -> list[Goal]:
        # id is a ms-timestamp, so ordering by it reproduces legacy's
        # append order without a separate sort_order column.
        stmt = select(Goal).where(Goal.project_key == project_key).order_by(Goal.id)
        if horizon is not None:
            stmt = stmt.where(Goal.horizon == horizon)
        return list(self.db.scalars(stmt))

    def get(self, goal_id: int) -> Goal | None:
        return self.db.get(Goal, goal_id)

    def add(self, goal: Goal) -> Goal:
        self.db.add(goal)
        self.db.commit()
        self.db.refresh(goal)
        return goal

    def save(self, goal: Goal) -> Goal:
        self.db.commit()
        self.db.refresh(goal)
        return goal

    def delete(self, goal: Goal) -> None:
        self.db.delete(goal)
        self.db.commit()


class BoardTaskRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(self, goal_id: int) -> list[BoardTask]:
        # id is a ms-timestamp, so ordering by it reproduces creation
        # order with no separate sort column — same convention as
        # GoalRepository.list / the old BoardRepository.list.
        stmt = select(BoardTask).where(BoardTask.goal_id == goal_id).order_by(BoardTask.id)
        return list(self.db.scalars(stmt))

    def get(self, task_id: int) -> BoardTask | None:
        return self.db.get(BoardTask, task_id)

    def add(self, task: BoardTask) -> BoardTask:
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task

    def save(self, task: BoardTask) -> BoardTask:
        self.db.commit()
        self.db.refresh(task)
        return task

    def delete(self, task: BoardTask) -> None:
        self.db.delete(task)
        self.db.commit()


class BoardCardRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(self, task_id: int) -> list[BoardCard]:
        # Pinned first, then by id — matches the Focus Board pilot's own
        # `cards_in()` contract exactly (id is a ms-timestamp, so "by id"
        # already reproduces creation order with no separate sort column,
        # same reasoning GoalRepository.list applies).
        stmt = (
            select(BoardCard)
            .where(BoardCard.task_id == task_id)
            .order_by(BoardCard.pinned.desc(), BoardCard.id)
        )
        return list(self.db.scalars(stmt))

    def get(self, card_id: int) -> BoardCard | None:
        return self.db.get(BoardCard, card_id)

    def list_all(self) -> list[BoardCard]:
        """Every card across every task's board, unscoped — for timer
        reconciliation and stop-all-timers-on-shutdown, which both need
        to sweep every open session regardless of which task's board it
        lives on (mirrors TaskRepository.list() being unscoped for the
        same reason)."""
        return list(self.db.scalars(select(BoardCard)))

    def add(self, card: BoardCard) -> BoardCard:
        self.db.add(card)
        self.db.commit()
        self.db.refresh(card)
        return card

    def save(self, card: BoardCard) -> BoardCard:
        self.db.commit()
        self.db.refresh(card)
        return card

    def delete(self, card: BoardCard) -> None:
        self.db.delete(card)
        self.db.commit()

    def get_app_state(self) -> AppState:
        return _get_app_state(self.db)


class BusinessAnalysisRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, project_key: str) -> BusinessAnalysis | None:
        return self.db.get(BusinessAnalysis, project_key)

    def save(self, ba: BusinessAnalysis) -> BusinessAnalysis:
        self.db.commit()
        self.db.refresh(ba)
        return ba

    def list_log(self, project_key: str) -> list[DecisionLog]:
        stmt = (
            select(DecisionLog)
            .where(DecisionLog.project_key == project_key)
            .order_by(DecisionLog.id)
        )
        return list(self.db.scalars(stmt))

    def add_log_entry(self, entry: DecisionLog) -> DecisionLog:
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def trim_log(self, project_key: str, keep: int) -> None:
        """Delete all but the most recent `keep` entries — matches the
        legacy app's `_log[-40:]`, which permanently discards anything
        older once the cap is hit."""
        rows = self.list_log(project_key)
        if len(rows) <= keep:
            return
        for row in rows[: len(rows) - keep]:
            self.db.delete(row)
        self.db.commit()

    def list_legacy_boxes(self, project_key: str) -> list[LegacyAnalysisBox]:
        stmt = (
            select(LegacyAnalysisBox)
            .where(LegacyAnalysisBox.project_key == project_key)
            .order_by(LegacyAnalysisBox.box_index)
        )
        return list(self.db.scalars(stmt))


class JourneyRepository:
    def __init__(self, db: Session):
        self.db = db

    # ── Journey header (1:1) ─────────────────────────────────────────
    def get_journey(self, project_key: str) -> ProjectJourney | None:
        return self.db.get(ProjectJourney, project_key)

    def save_journey(self, journey: ProjectJourney) -> ProjectJourney:
        self.db.commit()
        self.db.refresh(journey)
        return journey

    # ── Stages ────────────────────────────────────────────────────────
    def list_stages(self, project_key: str) -> list[JourneyStage]:
        stmt = select(JourneyStage).where(JourneyStage.project_key == project_key).order_by(JourneyStage.stage_index)
        return list(self.db.scalars(stmt))

    def get_stage(self, project_key: str, stage_index: int) -> JourneyStage | None:
        stmt = select(JourneyStage).where(
            JourneyStage.project_key == project_key, JourneyStage.stage_index == stage_index
        )
        return self.db.scalars(stmt).first()

    def save_stage(self, stage: JourneyStage) -> JourneyStage:
        self.db.commit()
        self.db.refresh(stage)
        return stage

    # ── Tasks ─────────────────────────────────────────────────────────
    def list_tasks(self, project_key: str) -> list[JourneyTask]:
        stmt = select(JourneyTask).where(JourneyTask.project_key == project_key).order_by(JourneyTask.id)
        return list(self.db.scalars(stmt))

    def get_task(self, task_id: int) -> JourneyTask | None:
        return self.db.get(JourneyTask, task_id)

    def add_task(self, task: JourneyTask) -> JourneyTask:
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task

    def save_task(self, task: JourneyTask) -> JourneyTask:
        self.db.commit()
        self.db.refresh(task)
        return task

    def delete_task(self, task: JourneyTask) -> None:
        self.db.delete(task)
        self.db.commit()

    # ── Log entries ───────────────────────────────────────────────────
    def list_logs(self, project_key: str) -> list[JourneyLogEntry]:
        # Newest first — matches legacy's insert-at-0 (the day's finding
        # belongs at the top, not buried under months of history).
        stmt = (
            select(JourneyLogEntry)
            .where(JourneyLogEntry.project_key == project_key)
            .order_by(JourneyLogEntry.id.desc())
        )
        return list(self.db.scalars(stmt))

    def get_log(self, entry_id: int) -> JourneyLogEntry | None:
        return self.db.get(JourneyLogEntry, entry_id)

    def add_log(self, entry: JourneyLogEntry) -> JourneyLogEntry:
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def save_log(self, entry: JourneyLogEntry) -> JourneyLogEntry:
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def delete_log(self, entry: JourneyLogEntry) -> None:
        self.db.delete(entry)
        self.db.commit()


class BdpRepository:
    """Business Plan Notes — a single global list (see BdpPlan's
    docstring), so unlike GoalRepository/JourneyRepository this has no
    project_key scoping anywhere."""

    def __init__(self, db: Session):
        self.db = db

    def get_app_state(self) -> AppState:
        return _get_app_state(self.db)

    def save_app_state(self, state: AppState) -> AppState:
        return _save_app_state(self.db, state)

    # ── Plans ────────────────────────────────────────────────────────
    def list_plans(self, include_archived: bool = False) -> list[BdpPlan]:
        stmt = select(BdpPlan)
        if not include_archived:
            stmt = stmt.where(BdpPlan.archived.is_(False))
        return list(self.db.scalars(stmt))

    def get_plan(self, plan_id: int) -> BdpPlan | None:
        return self.db.get(BdpPlan, plan_id)

    def add_plan(self, plan: BdpPlan) -> BdpPlan:
        self.db.add(plan)
        self.db.commit()
        self.db.refresh(plan)
        return plan

    def save_plan(self, plan: BdpPlan) -> BdpPlan:
        self.db.commit()
        self.db.refresh(plan)
        return plan

    def delete_plan(self, plan: BdpPlan) -> None:
        # Actions have no ON DELETE CASCADE at the DB level (SQLite
        # doesn't enforce it by default here) — clear them explicitly so
        # a deleted plan doesn't leave orphaned action rows behind.
        for action in self.list_actions(plan.id):
            self.db.delete(action)
        self.db.delete(plan)
        self.db.commit()

    # ── Next-actions checklist ──────────────────────────────────────
    def list_actions(self, plan_id: int) -> list[BdpAction]:
        stmt = select(BdpAction).where(BdpAction.plan_id == plan_id).order_by(BdpAction.sort_order)
        return list(self.db.scalars(stmt))

    def get_action(self, action_id: int) -> BdpAction | None:
        return self.db.get(BdpAction, action_id)

    def add_action(self, action: BdpAction) -> BdpAction:
        self.db.add(action)
        self.db.commit()
        self.db.refresh(action)
        return action

    def save_action(self, action: BdpAction) -> BdpAction:
        self.db.commit()
        self.db.refresh(action)
        return action

    def delete_action(self, action: BdpAction) -> None:
        self.db.delete(action)
        self.db.commit()


class QuarterlyRepository:
    """90-Day Quarterly Plan. AppState access mirrors BdpRepository's —
    q90_cycle_start/q90_cycle_days are global settings, not owned by any
    one cycle's answer rows."""

    def __init__(self, db: Session):
        self.db = db

    def get_app_state(self) -> AppState:
        return _get_app_state(self.db)

    def save_app_state(self, state: AppState) -> AppState:
        return _save_app_state(self.db, state)

    def get_answer(self, cycle_start: str, area: str) -> QuarterlyAnswer | None:
        stmt = select(QuarterlyAnswer).where(
            QuarterlyAnswer.cycle_start == cycle_start, QuarterlyAnswer.area == area
        )
        return self.db.scalars(stmt).first()

    def list_answers(self, cycle_start: str) -> list[QuarterlyAnswer]:
        stmt = select(QuarterlyAnswer).where(QuarterlyAnswer.cycle_start == cycle_start)
        return list(self.db.scalars(stmt))

    def add_answer(self, answer: QuarterlyAnswer) -> QuarterlyAnswer:
        self.db.add(answer)
        self.db.commit()
        self.db.refresh(answer)
        return answer

    def save_answer(self, answer: QuarterlyAnswer) -> QuarterlyAnswer:
        self.db.commit()
        self.db.refresh(answer)
        return answer

    def rename_cycle(self, old_start: str, new_start: str) -> None:
        """Move every answer row from old_start to new_start — matches
        legacy's _set_cycle: if the destination already has answers,
        those win and the source is left alone rather than overwritten
        (nothing is ever silently deleted either way)."""
        if old_start == new_start or self.list_answers(new_start):
            return
        for row in self.list_answers(old_start):
            row.cycle_start = new_start
        self.db.commit()

    def get_area_meta(self, area_key: str) -> Q90AreaMeta | None:
        return self.db.get(Q90AreaMeta, area_key)

    def list_area_meta(self) -> list[Q90AreaMeta]:
        return list(self.db.scalars(select(Q90AreaMeta)))

    def add_area_meta(self, meta: Q90AreaMeta) -> Q90AreaMeta:
        self.db.add(meta)
        self.db.commit()
        self.db.refresh(meta)
        return meta

    def save_area_meta(self, meta: Q90AreaMeta) -> Q90AreaMeta:
        self.db.commit()
        self.db.refresh(meta)
        return meta


class HourPlanRepository:
    """Per-(day, hour) rows for the TODAY hour-by-hour plan.

    Its own class rather than a few methods on HabitRepository: legacy
    stores this under the same `_habit_data` blob as the journal notes,
    but they are unrelated — one is free text about the day, the other
    is a schedule — and the only reason they shared a home there was
    that legacy had exactly one dict to put things in.
    """

    def __init__(self, db: Session):
        self.db = db

    def get_app_state(self) -> AppState:
        """The four phase-start hours live here, and this plan derives
        its blocks from them rather than storing its own copy."""
        return _get_app_state(self.db)

    def hour_slots(self, day: str) -> list[HourSlot]:
        """Everything visible on `day`.

        Three kinds of row show up here:
          - written on this day (one-off or carried, finished or not);
          - carried, unfinished, written on an EARLIER day — the point of
            the feature, a task that keeps asking until it is done;
          - carried and finished ON this day, so ticking it does not make
            it disappear out from under the click.

        A carried row finished on an earlier day is deliberately absent:
        finishing is what ends the carry.
        """
        rows = (
            self.db.query(HourSlot)
            .filter(
                HourSlot.day == day,
            )
            .all()
        )
        carried = (
            self.db.query(HourSlot)
            .filter(
                HourSlot.repeat.is_(True),
                HourSlot.day < day,
                (HourSlot.done_day.is_(None)) | (HourSlot.done_day == day),
            )
            .all()
        )
        # A row written today wins its hour outright. Without this, adding
        # something to an hour a carried task already occupies would show
        # two entries in one slot with no way to tell which the tick
        # belongs to.
        taken = {r.hour for r in rows}
        return list(rows) + [r for r in carried if r.hour not in taken]

    def get_hour_slot(self, slot_id: int) -> HourSlot | None:
        """One row by its own id. Needed because a task started from an
        hour remembers the ROW, not the (day, hour) pair: a carried entry
        keeps the day it was written on, so storing today's date would
        stop pointing at it the moment the clock passed midnight."""
        return self.db.get(HourSlot, slot_id)

    def set_hour_slot(
        self,
        day: str,
        hour: int,
        text: str | None = None,
        done: bool | None = None,
        repeat: bool | None = None,
    ) -> HourSlot:
        """Upsert one slot. `text` and `done` are independently optional
        so ticking a box cannot blank the text it belongs to, and typing
        cannot silently un-tick — the two controls are separate in the UI
        and separate here (legacy's _exec_set, 5553-5562)."""
        row = (
            self.db.query(HourSlot)
            .filter(HourSlot.day == day, HourSlot.hour == hour)
            .one_or_none()
        )
        if row is None:
            # Editing an hour a carried task occupies edits THAT task,
            # not a new copy for today. The user chose "changes it every
            # day": a carried entry is one thing you keep, so there is
            # only ever one row to change.
            row = (
                self.db.query(HourSlot)
                .filter(
                    HourSlot.hour == hour,
                    HourSlot.repeat.is_(True),
                    HourSlot.day < day,
                    (HourSlot.done_day.is_(None)) | (HourSlot.done_day == day),
                )
                .order_by(HourSlot.day.desc())
                .first()
            )
        if row is None:
            row = HourSlot(day=day, hour=hour, text="", done=False)
            self.db.add(row)
        if text is not None:
            row.text = text
        if done is not None:
            row.done = bool(done)
            # Stamped with the day of the CLICK, not the row's own day.
            row.done_day = day if row.done else None
        if repeat is not None:
            row.repeat = bool(repeat)
        # Clearing the text clears the tick with it: a slot with no task
        # cannot be "done", and leaving the flag set would count toward
        # tomorrow's totals if the same hour were reused.
        if not (row.text or "").strip():
            row.done = False
            row.done_day = None
            row.repeat = False
        self.db.commit()
        self.db.refresh(row)
        return row


class MorningRitualRepository:
    """One row per day, created on first touch — same shape as
    DailyIntention (see that model's docstring and get_intention/
    set_intention above)."""

    def __init__(self, db: Session):
        self.db = db

    def get(self, day: str) -> MorningRitual | None:
        return self.db.get(MorningRitual, day)

    def get_or_create(self, day: str) -> MorningRitual:
        row = self.db.get(MorningRitual, day)
        if row is None:
            row = MorningRitual(day=day)
            self.db.add(row)
            try:
                self.db.commit()
            except IntegrityError:
                # Two requests raced to create today's row (e.g. React
                # StrictMode firing a component's mount effect twice in
                # dev) — the loser rolls back and reads what the winner
                # just inserted, instead of crashing.
                self.db.rollback()
                row = self.db.get(MorningRitual, day)
                assert row is not None
                return row
            self.db.refresh(row)
        return row

    def save(self, row: MorningRitual) -> MorningRitual:
        self.db.commit()
        self.db.refresh(row)
        return row

    def get_range(self, days: list[str]) -> dict[str, MorningRitual]:
        """Every stored row among `days`, keyed by day — a day with no
        row at all means the ritual was never opened that day, which the
        trend view has to tell apart from "opened but not finished"."""
        if not days:
            return {}
        rows = self.db.query(MorningRitual).filter(MorningRitual.day.in_(days)).all()
        return {r.day: r for r in rows}


class NightClosureRepository:
    """One row per day, same shape as MorningRitualRepository above —
    see NightClosure's own docstring."""

    def __init__(self, db: Session):
        self.db = db

    def get(self, day: str) -> NightClosure | None:
        return self.db.get(NightClosure, day)

    def get_or_create(self, day: str) -> NightClosure:
        row = self.db.get(NightClosure, day)
        if row is None:
            row = NightClosure(day=day)
            self.db.add(row)
            try:
                self.db.commit()
            except IntegrityError:
                # Same race as MorningRitualRepository.get_or_create
                # above — see that comment.
                self.db.rollback()
                row = self.db.get(NightClosure, day)
                assert row is not None
                return row
            self.db.refresh(row)
        return row

    def save(self, row: NightClosure) -> NightClosure:
        self.db.commit()
        self.db.refresh(row)
        return row

    def get_range(self, days: list[str]) -> dict[str, NightClosure]:
        """Every stored row among `days`, keyed by day — see
        MorningRitualRepository.get_range above, same shape and reason
        (MorningRitualEngine.trend batches its close_time lookups with
        this instead of one query per day)."""
        if not days:
            return {}
        rows = self.db.query(NightClosure).filter(NightClosure.day.in_(days)).all()
        return {r.day: r for r in rows}
