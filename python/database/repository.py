from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from database.models import (
    AppState,
    BdpAction,
    BdpPlan,
    BusinessAnalysis,
    CirclePerson,
    DailyIntention,
    DecisionLog,
    Goal,
    Habit,
    HabitCompletion,
    JourneyLogEntry,
    JourneyStage,
    JourneyTask,
    LegacyAnalysisBox,
    Project,
    ProjectActivity,
    ProjectJourney,
    ProjectSubtask,
    QuarterlyAnswer,
    Task,
)


class TaskRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(self, list_key: str | None = None) -> list[Task]:
        stmt = select(Task)
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


class HabitRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(self, category: str | None = None, active_only: bool = True) -> list[Habit]:
        stmt = select(Habit)
        if category is not None:
            stmt = stmt.where(Habit.category == category)
        if active_only:
            stmt = stmt.where(Habit.active.is_(True))
        stmt = stmt.order_by(Habit.category, Habit.sort_order)
        return list(self.db.scalars(stmt))

    def get(self, habit_id: int) -> Habit | None:
        return self.db.get(Habit, habit_id)

    def add(self, habit: Habit) -> Habit:
        self.db.add(habit)
        self.db.commit()
        self.db.refresh(habit)
        return habit

    def save(self, habit: Habit) -> Habit:
        self.db.commit()
        self.db.refresh(habit)
        return habit

    def get_completion(self, habit_id: int, day: str) -> HabitCompletion | None:
        stmt = select(HabitCompletion).where(
            HabitCompletion.habit_id == habit_id, HabitCompletion.day == day
        )
        return self.db.scalars(stmt).first()

    def completions_for_day(self, day: str) -> list[HabitCompletion]:
        stmt = select(HabitCompletion).where(HabitCompletion.day == day)
        return list(self.db.scalars(stmt))

    def upsert_completion(self, habit_id: int, day: str, done: bool) -> HabitCompletion:
        row = self.get_completion(habit_id, day)
        if row is None:
            row = HabitCompletion(habit_id=habit_id, day=day, done=done)
            self.db.add(row)
        else:
            row.done = done
        self.db.commit()
        self.db.refresh(row)
        return row

    def get_intention(self, day: str) -> DailyIntention | None:
        return self.db.get(DailyIntention, day)

    def set_intention(self, day: str, text: str) -> DailyIntention:
        row = self.db.get(DailyIntention, day)
        if row is None:
            row = DailyIntention(day=day, text=text)
            self.db.add(row)
        else:
            row.text = text
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
