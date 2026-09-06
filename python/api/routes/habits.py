from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import (
    DaySummaryOut,
    HabitCategoryT,
    HabitCreate,
    HabitOut,
    HabitRename,
    IntentionOut,
    IntentionSet,
    WeekScoreOut,
)
from database.connection import get_db
from database.repository import HabitRepository
from engine.habits import HabitEngine

router = APIRouter(prefix="/api/habits", tags=["habits"])
intentions_router = APIRouter(prefix="/api/intentions", tags=["intentions"])


def get_engine(db: Session = Depends(get_db)) -> HabitEngine:
    return HabitEngine(HabitRepository(db))


def _today() -> str:
    return str(date.today())


@router.get("", response_model=list[HabitOut])
def list_habits(
    category: HabitCategoryT | None = None,
    day: str | None = None,
    engine: HabitEngine = Depends(get_engine),
):
    return engine.list_with_status(day or _today(), category)


@router.post("", response_model=HabitOut)
def create_habit(payload: HabitCreate, engine: HabitEngine = Depends(get_engine)):
    try:
        return engine.create_habit(payload.category, payload.name)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/{habit_id}", response_model=HabitOut)
def rename_habit(habit_id: int, payload: HabitRename, engine: HabitEngine = Depends(get_engine)):
    habit = engine.rename_habit(habit_id, payload.name)
    if habit is None:
        raise HTTPException(404, "Habit not found")
    return habit


@router.delete("/{habit_id}", response_model=HabitOut)
def deactivate_habit(habit_id: int, engine: HabitEngine = Depends(get_engine)):
    habit = engine.deactivate_habit(habit_id)
    if habit is None:
        raise HTTPException(404, "Habit not found")
    return habit


@router.post("/{habit_id}/toggle")
def toggle_completion(habit_id: int, day: str | None = None, engine: HabitEngine = Depends(get_engine)):
    if engine.repo.get(habit_id) is None:
        raise HTTPException(404, "Habit not found")
    done = engine.toggle_completion(habit_id, day or _today())
    return {"habit_id": habit_id, "day": day or _today(), "done": done}


@router.get("/summary", response_model=DaySummaryOut)
def day_summary(day: str | None = None, engine: HabitEngine = Depends(get_engine)):
    return engine.day_summary(day or _today())


@router.get("/streak")
def streak(engine: HabitEngine = Depends(get_engine)):
    return {"streak": engine.streak()}


@router.get("/week", response_model=list[WeekScoreOut])
def week_scores(engine: HabitEngine = Depends(get_engine)):
    return engine.week_scores()


@intentions_router.get("/{day}", response_model=IntentionOut)
def get_intention(day: str, engine: HabitEngine = Depends(get_engine)):
    return {"day": day, "text": engine.get_intention(day)}


@intentions_router.put("/{day}", response_model=IntentionOut)
def set_intention(day: str, payload: IntentionSet, engine: HabitEngine = Depends(get_engine)):
    text = engine.set_intention(day, payload.text)
    return {"day": day, "text": text}
