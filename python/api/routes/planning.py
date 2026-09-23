from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import (
    CarryForwardAction,
    ChecklistItemCreate,
    ChecklistItemOut,
    GoalOwnerKeyT,
    MilestoneCreate,
    MilestoneEdit,
    MilestoneOut,
    OutcomeCreate,
    OutcomeEdit,
    OutcomeOut,
    PlanTaskCreate,
    PlanTaskEdit,
    PlanTaskOut,
    ScheduleSet,
    WinCreate,
    WinEdit,
    WinOut,
)
from database.connection import get_db
from database.repository import PlanningRepository
from engine.planning import ChildrenExistError, PlanningEngine

router = APIRouter(prefix="/api/planning", tags=["planning"])


def get_engine(db: Session = Depends(get_db)) -> PlanningEngine:
    return PlanningEngine(PlanningRepository(db))


# ── Outcomes ──────────────────────────────────────────────────────────
@router.get("/{owner_key}/outcomes", response_model=list[OutcomeOut])
def list_outcomes(owner_key: GoalOwnerKeyT, engine: PlanningEngine = Depends(get_engine)):
    return engine.list_outcomes(owner_key)


@router.post("/{owner_key}/outcomes", response_model=OutcomeOut)
def create_outcome(owner_key: GoalOwnerKeyT, payload: OutcomeCreate, engine: PlanningEngine = Depends(get_engine)):
    try:
        return engine.create_outcome(owner_key, payload.title, payload.year)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/outcomes/{outcome_id}", response_model=OutcomeOut)
def edit_outcome(outcome_id: int, payload: OutcomeEdit, engine: PlanningEngine = Depends(get_engine)):
    outcome = engine.edit_outcome(outcome_id, payload.title, payload.status)
    if outcome is None:
        raise HTTPException(404, "Outcome not found")
    return outcome


@router.delete("/outcomes/{outcome_id}")
def delete_outcome(outcome_id: int, force: bool = False, engine: PlanningEngine = Depends(get_engine)):
    try:
        if not engine.delete_outcome(outcome_id, force=force):
            raise HTTPException(404, "Outcome not found")
    except ChildrenExistError as e:
        raise HTTPException(409, f"{e.count} milestone(s) exist under this outcome")
    return {"ok": True}


# ── Milestones ────────────────────────────────────────────────────────
@router.get("/outcomes/{outcome_id}/milestones", response_model=list[MilestoneOut])
def list_milestones(outcome_id: int, engine: PlanningEngine = Depends(get_engine)):
    return engine.list_milestones(outcome_id)


@router.post("/milestones", response_model=MilestoneOut)
def create_milestone(payload: MilestoneCreate, engine: PlanningEngine = Depends(get_engine)):
    try:
        return engine.create_milestone(payload.outcome_id, payload.title, payload.month, payload.year)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/milestones/{milestone_id}", response_model=MilestoneOut)
def edit_milestone(milestone_id: int, payload: MilestoneEdit, engine: PlanningEngine = Depends(get_engine)):
    milestone = engine.edit_milestone(milestone_id, payload.title, payload.status, payload.outcome_id)
    if milestone is None:
        raise HTTPException(404, "Milestone not found")
    return milestone


@router.delete("/milestones/{milestone_id}")
def delete_milestone(milestone_id: int, force: bool = False, engine: PlanningEngine = Depends(get_engine)):
    try:
        if not engine.delete_milestone(milestone_id, force=force):
            raise HTTPException(404, "Milestone not found")
    except ChildrenExistError as e:
        raise HTTPException(409, f"{e.count} win(s) exist under this milestone")
    return {"ok": True}


# ── Wins ──────────────────────────────────────────────────────────────
@router.get("/milestones/{milestone_id}/wins", response_model=list[WinOut])
def list_wins(milestone_id: int, engine: PlanningEngine = Depends(get_engine)):
    return engine.list_wins(milestone_id)


@router.post("/wins", response_model=WinOut)
def create_win(payload: WinCreate, engine: PlanningEngine = Depends(get_engine)):
    try:
        return engine.create_win(payload.milestone_id, payload.title, payload.week_start_date, payload.criteria)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/wins/{win_id}", response_model=WinOut)
def edit_win(win_id: int, payload: WinEdit, engine: PlanningEngine = Depends(get_engine)):
    win = engine.edit_win(win_id, payload.title, payload.criteria, payload.status, payload.milestone_id)
    if win is None:
        raise HTTPException(404, "Win not found")
    return win


@router.delete("/wins/{win_id}")
def delete_win(win_id: int, force: bool = False, engine: PlanningEngine = Depends(get_engine)):
    try:
        if not engine.delete_win(win_id, force=force):
            raise HTTPException(404, "Win not found")
    except ChildrenExistError as e:
        raise HTTPException(409, f"{e.count} task(s) exist under this win")
    return {"ok": True}


# ── Plan tasks ────────────────────────────────────────────────────────
@router.get("/wins/{win_id}/tasks", response_model=list[PlanTaskOut])
def list_plan_tasks(win_id: int, engine: PlanningEngine = Depends(get_engine)):
    return [engine._plan_task_out(t) for t in engine.repo.list_plan_tasks(win_id)]


@router.get("/{owner_key}/tasks/by-date", response_model=list[PlanTaskOut])
def list_plan_tasks_by_date(owner_key: GoalOwnerKeyT, date: str, engine: PlanningEngine = Depends(get_engine)):
    return [engine._plan_task_out(t) for t in engine.repo.list_plan_tasks_by_date(owner_key, date)]


@router.post("/{owner_key}/tasks", response_model=PlanTaskOut)
def create_plan_task(owner_key: GoalOwnerKeyT, payload: PlanTaskCreate, engine: PlanningEngine = Depends(get_engine)):
    try:
        return engine.create_plan_task(owner_key, payload.title, payload.win_id, payload.scheduled_date)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/tasks/{task_id}", response_model=PlanTaskOut)
def edit_plan_task(task_id: int, payload: PlanTaskEdit, engine: PlanningEngine = Depends(get_engine)):
    task = engine.edit_plan_task(task_id, payload.title, payload.status)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


@router.patch("/tasks/{task_id}/schedule", response_model=PlanTaskOut)
def schedule_plan_task(task_id: int, payload: ScheduleSet, engine: PlanningEngine = Depends(get_engine)):
    task = engine.schedule_plan_task(task_id, payload.scheduled_date, payload.win_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


# Future interaction contract for "Schedule a specific date" (real
# date-picker, not yet built — see the Phase A design spec's Carry
# Forward edge case): { planned_period, scheduled_date, status, parent_win }
@router.post("/tasks/{task_id}/carry-forward", response_model=PlanTaskOut)
def carry_forward_plan_task(task_id: int, payload: CarryForwardAction, engine: PlanningEngine = Depends(get_engine)):
    task = engine.carry_forward_plan_task(task_id, payload.action)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


@router.delete("/tasks/{task_id}")
def delete_plan_task(task_id: int, engine: PlanningEngine = Depends(get_engine)):
    if not engine.delete_plan_task(task_id):
        raise HTTPException(404, "Task not found")
    return {"ok": True}


# ── Checklist items (generic — attach to exactly one of outcome/milestone/win) ──
@router.get("/checklist-items", response_model=list[ChecklistItemOut])
def list_checklist_items(
    outcome_id: int | None = None,
    milestone_id: int | None = None,
    win_id: int | None = None,
    engine: PlanningEngine = Depends(get_engine),
):
    return engine.repo.list_checklist_items(outcome_id=outcome_id, milestone_id=milestone_id, win_id=win_id)


@router.post("/checklist-items", response_model=ChecklistItemOut)
def add_checklist_item(payload: ChecklistItemCreate, engine: PlanningEngine = Depends(get_engine)):
    try:
        return engine.add_checklist_item(
            payload.text, outcome_id=payload.outcome_id, milestone_id=payload.milestone_id, win_id=payload.win_id
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/checklist-items/{pid}/toggle", response_model=ChecklistItemOut)
def toggle_checklist_item(pid: str, engine: PlanningEngine = Depends(get_engine)):
    item = engine.toggle_checklist_item(pid)
    if item is None:
        raise HTTPException(404, "Checklist item not found")
    return item


@router.delete("/checklist-items/{pid}")
def delete_checklist_item(pid: str, engine: PlanningEngine = Depends(get_engine)):
    if not engine.delete_checklist_item(pid):
        raise HTTPException(404, "Checklist item not found")
    return {"ok": True}
