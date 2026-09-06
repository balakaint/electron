from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import (
    GoalCreate,
    GoalEdit,
    GoalHorizonT,
    GoalOut,
    GoalPanelOut,
    GoalProjectSet,
    ProjectKeyT,
    SectionTitleSet,
)
from database.connection import get_db
from database.repository import GoalRepository, TaskRepository
from engine.goals import GoalEngine, get_goal_panel, set_goal_project, set_section_title

router = APIRouter(prefix="/api/projects", tags=["goals"])
panel_router = APIRouter(prefix="/api/goals", tags=["goals"])


def get_engine(db: Session = Depends(get_db)) -> GoalEngine:
    return GoalEngine(GoalRepository(db))


def get_task_repo(db: Session = Depends(get_db)) -> TaskRepository:
    return TaskRepository(db)


# ── Per-project goal CRUD ────────────────────────────────────────────
@router.get("/{key}/goals", response_model=list[GoalOut])
def list_goals(key: ProjectKeyT, horizon: GoalHorizonT | None = None, engine: GoalEngine = Depends(get_engine)):
    return engine.list_goals(key, horizon)


@router.post("/{key}/goals", response_model=GoalOut)
def create_goal(key: ProjectKeyT, payload: GoalCreate, engine: GoalEngine = Depends(get_engine)):
    try:
        return engine.create_goal(key, payload.horizon, payload.text, payload.start_date, payload.note)
    except ValueError as e:
        raise HTTPException(400, str(e))


# Flat under /goals/{id} rather than nested — matches subtasks'
# /subtasks/{pid} shape, since a goal id is already globally unique.
@router.put("/goals/{goal_id}", response_model=GoalOut)
def edit_goal(goal_id: int, payload: GoalEdit, engine: GoalEngine = Depends(get_engine)):
    goal = engine.edit_goal(goal_id, payload.text, payload.start_date, payload.note)
    if goal is None:
        raise HTTPException(404, "Goal not found")
    return goal


@router.post("/goals/{goal_id}/toggle", response_model=GoalOut)
def toggle_goal(goal_id: int, engine: GoalEngine = Depends(get_engine)):
    goal = engine.toggle_goal(goal_id)
    if goal is None:
        raise HTTPException(404, "Goal not found")
    return goal


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: int, engine: GoalEngine = Depends(get_engine)):
    if not engine.delete_goal(goal_id):
        raise HTTPException(404, "Goal not found")
    return {"ok": True}


# ── Cross-project panel state (which project is shown + section titles) ──
@panel_router.get("/panel", response_model=GoalPanelOut)
def read_panel(repo: TaskRepository = Depends(get_task_repo)):
    return get_goal_panel(repo)


@panel_router.post("/panel/project", response_model=GoalPanelOut)
def switch_panel_project(payload: GoalProjectSet, repo: TaskRepository = Depends(get_task_repo)):
    return set_goal_project(repo, payload.project_key)


@panel_router.post("/panel/section-title", response_model=GoalPanelOut)
def rename_section_title(payload: SectionTitleSet, repo: TaskRepository = Depends(get_task_repo)):
    try:
        return set_section_title(repo, payload.horizon, payload.title)
    except ValueError as e:
        raise HTTPException(400, str(e))
