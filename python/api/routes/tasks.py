from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import DayViewOut, DayViewSet, ListKey, StrikeToggle, TaskCreate, TaskEdit, TaskOut, TaskRestore
from database.connection import get_db
from database.repository import ProjectRepository, TaskRepository
from engine.tasks import STRIKE_MAX, StrikeLimitReached, TaskEngine

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def get_engine(db: Session = Depends(get_db)) -> TaskEngine:
    return TaskEngine(TaskRepository(db), ProjectRepository(db))


@router.get("", response_model=list[TaskOut])
def list_tasks(list_key: ListKey | None = None, engine: TaskEngine = Depends(get_engine)):
    return engine.list_tasks(list_key)


@router.get("/strike", response_model=list[TaskOut])
def list_strike_tasks(engine: TaskEngine = Depends(get_engine)):
    """Today's committed Focus tasks (max STRIKE_MAX)."""
    return engine.list_strike_tasks()


@router.get("/day-view", response_model=DayViewOut)
def get_day_view(engine: TaskEngine = Depends(get_engine)):
    return {"view": engine.get_day_view()}


@router.post("/day-view", response_model=DayViewOut)
def set_day_view(payload: DayViewSet, engine: TaskEngine = Depends(get_engine)):
    return {"view": engine.set_day_view(payload.view)}


@router.post("", response_model=TaskOut)
def create_task(payload: TaskCreate, engine: TaskEngine = Depends(get_engine)):
    try:
        return engine.create_task(payload.text, payload.list_key, payload.day)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/restore", response_model=TaskOut)
def restore_task(payload: TaskRestore, engine: TaskEngine = Depends(get_engine)):
    """Undo-delete: re-inserts a task exactly as the client last saw it."""
    task = engine.restore_task(payload.model_dump())
    if task is None:
        raise HTTPException(409, "A task with that id already exists")
    return task


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: int, engine: TaskEngine = Depends(get_engine)):
    task = engine.get_task(task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


@router.put("/{task_id}", response_model=TaskOut)
def edit_task(task_id: int, payload: TaskEdit, engine: TaskEngine = Depends(get_engine)):
    task = engine.edit_task(task_id, payload.text)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


@router.delete("/{task_id}")
def delete_task(task_id: int, engine: TaskEngine = Depends(get_engine)):
    if not engine.delete_task(task_id):
        raise HTTPException(404, "Task not found")
    return {"ok": True}


@router.post("/{task_id}/toggle-done", response_model=TaskOut)
def toggle_done(task_id: int, engine: TaskEngine = Depends(get_engine)):
    task = engine.toggle_done(task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


@router.post("/{task_id}/set-mit", response_model=TaskOut)
def set_mit(task_id: int, engine: TaskEngine = Depends(get_engine)):
    task = engine.set_mit(task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


@router.post("/{task_id}/cycle-urgency", response_model=TaskOut)
def cycle_urgency(task_id: int, engine: TaskEngine = Depends(get_engine)):
    task = engine.cycle_urgency(task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


@router.post("/{task_id}/toggle-timer", response_model=TaskOut)
def toggle_timer(task_id: int, engine: TaskEngine = Depends(get_engine)):
    task = engine.toggle_timer(task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


@router.post("/{task_id}/reset-timer", response_model=TaskOut)
def reset_timer(task_id: int, engine: TaskEngine = Depends(get_engine)):
    task = engine.reset_timer(task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


@router.post("/{task_id}/toggle-strike", response_model=TaskOut)
def toggle_strike(task_id: int, payload: StrikeToggle | None = None, engine: TaskEngine = Depends(get_engine)):
    try:
        task = engine.toggle_strike(task_id, payload.project_key if payload else None)
    except StrikeLimitReached:
        raise HTTPException(409, f"Already {STRIKE_MAX}/{STRIKE_MAX} — full")
    if task is None:
        raise HTTPException(404, "Task not found or not a Focus task")
    return task
