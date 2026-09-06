from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import (
    GateUpdate,
    JourneyLogCreate,
    JourneyMetaUpdate,
    JourneyOut,
    JourneyTaskCreate,
    JourneyTaskEdit,
    ProjectKeyT,
    StageMetaUpdate,
)
from database.connection import get_db
from database.repository import JourneyRepository
from engine.journey import JourneyEngine

router = APIRouter(prefix="/api/projects/{key}/journey", tags=["journey"])
# Flat, id-addressed — a task/log-entry id is already globally unique
# (ms-timestamp), and the engine derives project_key from the row
# itself. Matches how goals.py splits project-scoped list/create from
# flat id-addressed edit/toggle/delete.
tasks_router = APIRouter(prefix="/api/journey/tasks", tags=["journey"])
logs_router = APIRouter(prefix="/api/journey/logs", tags=["journey"])


def get_engine(db: Session = Depends(get_db)) -> JourneyEngine:
    return JourneyEngine(JourneyRepository(db))


def _wrap(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("", response_model=JourneyOut)
def get_journey(key: ProjectKeyT, engine: JourneyEngine = Depends(get_engine)):
    return _wrap(engine.get, key)


@router.put("", response_model=JourneyOut)
def update_meta(key: ProjectKeyT, payload: JourneyMetaUpdate, engine: JourneyEngine = Depends(get_engine)):
    return _wrap(engine.update_meta, key, **payload.model_dump())


@router.put("/stages/{stage_index}", response_model=JourneyOut)
def update_stage_meta(
    key: ProjectKeyT, stage_index: int, payload: StageMetaUpdate, engine: JourneyEngine = Depends(get_engine)
):
    return _wrap(engine.update_stage_meta, key, stage_index, **payload.model_dump())


@router.put("/stages/{stage_index}/gate", response_model=JourneyOut)
def set_gate(key: ProjectKeyT, stage_index: int, payload: GateUpdate, engine: JourneyEngine = Depends(get_engine)):
    return _wrap(engine.set_gate, key, stage_index, payload.gate)


@router.post("/stages/{stage_index}/gate/toggle", response_model=JourneyOut)
def toggle_gate(key: ProjectKeyT, stage_index: int, engine: JourneyEngine = Depends(get_engine)):
    return _wrap(engine.toggle_gate, key, stage_index)


@router.post("/stages/{stage_index}/tasks", response_model=JourneyOut)
def add_task(
    key: ProjectKeyT, stage_index: int, payload: JourneyTaskCreate, engine: JourneyEngine = Depends(get_engine)
):
    try:
        return engine.add_task(key, stage_index, payload.text)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/stages/{stage_index}/logs", response_model=JourneyOut)
def add_log(
    key: ProjectKeyT, stage_index: int, payload: JourneyLogCreate, engine: JourneyEngine = Depends(get_engine)
):
    try:
        return engine.add_log(key, stage_index, payload.text)
    except ValueError as e:
        raise HTTPException(400, str(e))


@tasks_router.put("/{task_id}", response_model=JourneyOut)
def edit_task(task_id: int, payload: JourneyTaskEdit, engine: JourneyEngine = Depends(get_engine)):
    return _wrap(engine.edit_task, task_id, payload.text)


@tasks_router.post("/{task_id}/toggle", response_model=JourneyOut)
def toggle_task(task_id: int, engine: JourneyEngine = Depends(get_engine)):
    return _wrap(engine.toggle_task, task_id)


@tasks_router.delete("/{task_id}", response_model=JourneyOut)
def delete_task(task_id: int, engine: JourneyEngine = Depends(get_engine)):
    return _wrap(engine.delete_task, task_id)


@logs_router.post("/{entry_id}/cycle", response_model=JourneyOut)
def cycle_log(entry_id: int, engine: JourneyEngine = Depends(get_engine)):
    return _wrap(engine.cycle_log_status, entry_id)


@logs_router.delete("/{entry_id}", response_model=JourneyOut)
def delete_log(entry_id: int, engine: JourneyEngine = Depends(get_engine)):
    return _wrap(engine.delete_log, entry_id)
