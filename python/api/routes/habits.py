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
    MindsetHistoryEntry,
    MindsetOut,
    IntentionSet,
    MonthlyReportOut,
    ReflectionOut,
    WeekScoreOut,
    WinOut,
)
from database.connection import get_db
from database.repository import HabitRepository
from engine.habits import HabitEngine

router = APIRouter(prefix="/api/habits", tags=["habits"])
intentions_router = APIRouter(prefix="/api/intentions", tags=["intentions"])
mindset_router = APIRouter(prefix="/api/mindset", tags=["mindset"])
wins_router = APIRouter(prefix="/api/wins", tags=["wins"])
reflections_router = APIRouter(prefix="/api/reflections", tags=["reflections"])


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


@router.get("/monthly-report", response_model=MonthlyReportOut)
def monthly_report(engine: HabitEngine = Depends(get_engine)):
    return engine.monthly_report()


@intentions_router.get("/{day}", response_model=IntentionOut)
def get_intention(day: str, engine: HabitEngine = Depends(get_engine)):
    return {"day": day, "text": engine.get_intention(day)}


@intentions_router.put("/{day}", response_model=IntentionOut)
def set_intention(day: str, payload: IntentionSet, engine: HabitEngine = Depends(get_engine)):
    text = engine.set_intention(day, payload.text)
    return {"day": day, "text": text}


@wins_router.get("/{day}", response_model=WinOut)
def get_win(day: str, engine: HabitEngine = Depends(get_engine)):
    return {"day": day, "win": engine.get_win(day)}


@wins_router.put("/{day}", response_model=WinOut)
def set_win(day: str, payload: IntentionSet, engine: HabitEngine = Depends(get_engine)):
    win = engine.set_win(day, payload.text)
    return {"day": day, "win": win}


@mindset_router.get("/history", response_model=list[MindsetHistoryEntry])
def mindset_history(days: int = 7, engine: HabitEngine = Depends(get_engine)):
    """Declared BEFORE the /{day} route below: FastAPI matches in
    definition order, so with these swapped "history" would be captured
    as a date string and this endpoint would be unreachable."""
    return engine.mindset_history(days)


@mindset_router.get("/{day}", response_model=MindsetOut)
def get_mindset(day: str, engine: HabitEngine = Depends(get_engine)):
    return {"day": day, "mindset": engine.get_mindset(day)}


@mindset_router.put("/{day}", response_model=MindsetOut)
def set_mindset(day: str, payload: IntentionSet, engine: HabitEngine = Depends(get_engine)):
    return {"day": day, "mindset": engine.set_mindset(day, payload.text)}


@reflections_router.get("/{day}", response_model=ReflectionOut)
def get_reflection(day: str, engine: HabitEngine = Depends(get_engine)):
    return {"day": day, "reflection": engine.get_reflection(day)}


@reflections_router.put("/{day}", response_model=ReflectionOut)
def set_reflection(day: str, payload: IntentionSet, engine: HabitEngine = Depends(get_engine)):
    reflection = engine.set_reflection(day, payload.text)
    return {"day": day, "reflection": reflection}
