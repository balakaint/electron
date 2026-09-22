from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import (
    GoalCreate,
    GoalEdit,
    GoalHorizonT,
    GoalOut,
    GoalOwnerKeyT,
    GoalPanelOut,
    GoalProjectSet,
    GoalTaskCreate,
    GoalTaskOut,
    SectionTitleSet,
)
from database.connection import get_db
from database.repository import GoalRepository, ProjectRepository
from engine.board import goal_board_progress, goal_top_focus_card_title
from engine.goals import GoalEngine, get_goal_panel, set_goal_project, set_section_title

router = APIRouter(prefix="/api/projects", tags=["goals"])
panel_router = APIRouter(prefix="/api/goals", tags=["goals"])


def get_engine(db: Session = Depends(get_db)) -> GoalEngine:
    return GoalEngine(GoalRepository(db))


def get_project_repo(db: Session = Depends(get_db)) -> ProjectRepository:
    return ProjectRepository(db)


# board_done/board_focus/board_total aren't part of Goal at all (see
# GoalOut's own comment) — they're stapled onto the dict here, one extra
# count query per goal, rather than in GoalEngine, which has no reason
# to touch the board tables for a plain goal read. Goal lists in this
# app are a handful of rows (three horizons per project), so the
# per-goal query is not worth batching.
def _with_board_progress(db: Session, goal: dict) -> dict:
    done, focus, total = goal_board_progress(db, goal["id"])
    focus_title = goal_top_focus_card_title(db, goal["id"])
    return {**goal, "board_done": done, "board_focus": focus, "board_total": total, "board_focus_title": focus_title}


# ── Per-project goal CRUD ────────────────────────────────────────────
@router.get("/{key}/goals", response_model=list[GoalOut])
def list_goals(
    key: GoalOwnerKeyT, horizon: GoalHorizonT | None = None, engine: GoalEngine = Depends(get_engine), db: Session = Depends(get_db)
):
    return [_with_board_progress(db, g) for g in engine.list_goals(key, horizon)]


@router.post("/{key}/goals", response_model=GoalOut)
def create_goal(key: GoalOwnerKeyT, payload: GoalCreate, engine: GoalEngine = Depends(get_engine), db: Session = Depends(get_db)):
    try:
        goal = engine.create_goal(
            key,
            payload.horizon,
            payload.text,
            payload.start_date,
            payload.note,
            payload.next_action,
            payload.deadline,
        )
        return _with_board_progress(db, goal)
    except ValueError as e:
        raise HTTPException(400, str(e))


# Flat under /goals/{id} rather than nested — matches subtasks'
# /subtasks/{pid} shape, since a goal id is already globally unique.
@router.put("/goals/{goal_id}", response_model=GoalOut)
def edit_goal(goal_id: int, payload: GoalEdit, engine: GoalEngine = Depends(get_engine), db: Session = Depends(get_db)):
    goal = engine.edit_goal(
        goal_id,
        payload.text,
        payload.start_date,
        payload.note,
        payload.next_action,
        payload.deadline,
    )
    if goal is None:
        raise HTTPException(404, "Goal not found")
    return _with_board_progress(db, goal)


@router.post("/goals/{goal_id}/toggle", response_model=GoalOut)
def toggle_goal(goal_id: int, engine: GoalEngine = Depends(get_engine), db: Session = Depends(get_db)):
    goal = engine.toggle_goal(goal_id)
    if goal is None:
        raise HTTPException(404, "Goal not found")
    return _with_board_progress(db, goal)


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: int, engine: GoalEngine = Depends(get_engine)):
    if not engine.delete_goal(goal_id):
        raise HTTPException(404, "Goal not found")
    return {"ok": True}


# ── Goal tasks (flat checklist, editable right from the Goals panel card
# — no need to open the goal's board) ────────────────────────────────
@router.get("/goals/{goal_id}/tasks", response_model=list[GoalTaskOut])
def list_goal_tasks(goal_id: int, engine: GoalEngine = Depends(get_engine)):
    return engine.list_goal_tasks(goal_id)


@router.post("/goals/{goal_id}/tasks", response_model=GoalTaskOut)
def add_goal_task(goal_id: int, payload: GoalTaskCreate, engine: GoalEngine = Depends(get_engine)):
    try:
        return engine.add_goal_task(goal_id, payload.text)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/goals/tasks/{pid}/toggle", response_model=GoalTaskOut)
def toggle_goal_task(pid: str, engine: GoalEngine = Depends(get_engine)):
    task = engine.toggle_goal_task(pid)
    if task is None:
        raise HTTPException(404, "Goal task not found")
    return task


@router.delete("/goals/tasks/{pid}")
def delete_goal_task(pid: str, engine: GoalEngine = Depends(get_engine)):
    if not engine.delete_goal_task(pid):
        raise HTTPException(404, "Goal task not found")
    return {"ok": True}


# ── Cross-project panel state (which project is shown + section titles) ──
@panel_router.get("/panel", response_model=GoalPanelOut)
def read_panel(repo: ProjectRepository = Depends(get_project_repo)):
    return get_goal_panel(repo)


@panel_router.post("/panel/project", response_model=GoalPanelOut)
def switch_panel_project(payload: GoalProjectSet, repo: ProjectRepository = Depends(get_project_repo)):
    return set_goal_project(repo, payload.project_key)


@panel_router.post("/panel/section-title", response_model=GoalPanelOut)
def rename_section_title(payload: SectionTitleSet, repo: ProjectRepository = Depends(get_project_repo)):
    try:
        return set_section_title(repo, payload.horizon, payload.title)
    except ValueError as e:
        raise HTTPException(400, str(e))
