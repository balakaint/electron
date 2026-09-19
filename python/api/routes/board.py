from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import (
    BoardCardCreate,
    BoardCardEdit,
    BoardCardMove,
    BoardCardOut,
    BoardTaskCreate,
    BoardTaskEdit,
    BoardTaskOut,
)
from database.connection import get_db
from database.repository import BoardCardRepository, BoardTaskRepository
from engine.board import BoardEngine, BoardTaskEngine

router = APIRouter(prefix="/api/projects", tags=["board"])

# Superseded design note: this router used to expose a flat
# /{project_key}/board (card CRUD scoped to a project, with an optional
# goal_id on each card). The user corrected the shape to a 3-level
# hierarchy — Goal -> Task (1..N) -> that Task's own board — so the
# routes below are nested under a goal's tasks, and then under a
# task's cards, matching goals.py's own nested-plus-flat-by-id
# convention (nested list/create, flat by-id for edit/move/delete).


def get_task_engine(db: Session = Depends(get_db)) -> BoardTaskEngine:
    return BoardTaskEngine(BoardTaskRepository(db))


def get_card_engine(db: Session = Depends(get_db)) -> BoardEngine:
    return BoardEngine(BoardCardRepository(db))


# ── Tasks under a Goal ────────────────────────────────────────────────
@router.get("/goals/{goal_id}/tasks", response_model=list[BoardTaskOut])
def list_tasks(goal_id: int, engine: BoardTaskEngine = Depends(get_task_engine)):
    return engine.tasks_in(goal_id)


@router.post("/goals/{goal_id}/tasks", response_model=BoardTaskOut)
def add_task(goal_id: int, payload: BoardTaskCreate, engine: BoardTaskEngine = Depends(get_task_engine)):
    try:
        return engine.add_task(goal_id, payload.title)
    except ValueError as e:
        raise HTTPException(400, str(e))


# Flat under /board-tasks/{id} rather than nested — matches goals' own
# /goals/{id} shape, since a task id is already globally unique.
@router.put("/board-tasks/{task_id}", response_model=BoardTaskOut)
def edit_task(task_id: int, payload: BoardTaskEdit, engine: BoardTaskEngine = Depends(get_task_engine)):
    task = engine.edit_task(task_id, payload.title, payload.outcome, payload.next_action)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


@router.delete("/board-tasks/{task_id}")
def delete_task(task_id: int, engine: BoardTaskEngine = Depends(get_task_engine)):
    if not engine.delete_task(task_id):
        raise HTTPException(404, "Task not found")
    return {"ok": True}


# ── Cards on a Task's Individual Task Board ───────────────────────────
@router.get("/board-tasks/{task_id}/cards", response_model=list[BoardCardOut])
def list_cards(task_id: int, engine: BoardEngine = Depends(get_card_engine)):
    return engine.cards_in(task_id)


@router.post("/board-tasks/{task_id}/cards", response_model=BoardCardOut)
def add_card(task_id: int, payload: BoardCardCreate, engine: BoardEngine = Depends(get_card_engine)):
    try:
        return engine.add_card(task_id, payload.col, payload.title, payload.note, payload.priority)
    except ValueError as e:
        raise HTTPException(400, str(e))


# Declared BEFORE /board-cards/{card_id}/...: FastAPI matches in
# definition order, and "stop-all-timers" would otherwise be captured as
# a card_id and 422 on the int conversion (same caveat as
# /api/tasks/stop-all-timers).
@router.post("/board-cards/stop-all-timers")
def stop_all_card_timers(engine: BoardEngine = Depends(get_card_engine)):
    return {"closed": engine.stop_all_running()}


# Flat under /board-cards/{id} rather than nested — same reasoning as
# the tasks above.
@router.put("/board-cards/{card_id}", response_model=BoardCardOut)
def edit_card(card_id: int, payload: BoardCardEdit, engine: BoardEngine = Depends(get_card_engine)):
    try:
        card = engine.edit_card(card_id, payload.title, payload.note, payload.priority)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if card is None:
        raise HTTPException(404, "Card not found")
    return card


@router.post("/board-cards/{card_id}/move", response_model=BoardCardOut)
def move_card(card_id: int, payload: BoardCardMove, engine: BoardEngine = Depends(get_card_engine)):
    try:
        card = engine.move_card(card_id, payload.col)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if card is None:
        raise HTTPException(404, "Card not found")
    return card


@router.post("/board-cards/{card_id}/toggle-pin", response_model=BoardCardOut)
def toggle_pin(card_id: int, engine: BoardEngine = Depends(get_card_engine)):
    card = engine.toggle_pin(card_id)
    if card is None:
        raise HTTPException(404, "Card not found")
    return card


@router.post("/board-cards/{card_id}/toggle-timer", response_model=BoardCardOut)
def toggle_timer(card_id: int, engine: BoardEngine = Depends(get_card_engine)):
    card = engine.toggle_timer(card_id)
    if card is None:
        raise HTTPException(404, "Card not found")
    return card


@router.delete("/board-cards/{card_id}")
def delete_card(card_id: int, engine: BoardEngine = Depends(get_card_engine)):
    if not engine.delete_card(card_id):
        raise HTTPException(404, "Card not found")
    return {"ok": True}
