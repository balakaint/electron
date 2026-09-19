from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.schemas import DesignTodayOut, DesignTodaySet, MindsetHistoryEntry, MindsetOut, MindsetSet
from database.connection import get_db
from database.repository import MindsetRepository
from engine.mindset import MindsetEngine

# Was api/routes/habits.py — also carried the habit-checklist CRUD/
# toggle router and the intentions/wins/reflections routers, all removed
# 2026-09-14 along with the flat Discipline checklist and the Life
# Execution Board they powered (Zahid: "emon task list mainly regular
# chek kora hoy na"). Only mindset_router survives.
mindset_router = APIRouter(prefix="/api/mindset", tags=["mindset"])

# Discipline tab's "Design Today" morning brain-dump box (2026-09-18).
# Same daily_intentions row and engine as mindset, its own column
# (design_today) and its own route — no history endpoint, Zahid was
# explicit this box doesn't need one.
design_today_router = APIRouter(prefix="/api/design-today", tags=["design-today"])


def get_engine(db: Session = Depends(get_db)) -> MindsetEngine:
    return MindsetEngine(MindsetRepository(db))


@mindset_router.get("/history", response_model=list[MindsetHistoryEntry])
def mindset_history(days: int = 7, engine: MindsetEngine = Depends(get_engine)):
    """Declared BEFORE the /{day} route below: FastAPI matches in
    definition order, so with these swapped "history" would be captured
    as a date string and this endpoint would be unreachable."""
    return engine.mindset_history(days)


@mindset_router.get("/{day}", response_model=MindsetOut)
def get_mindset(day: str, engine: MindsetEngine = Depends(get_engine)):
    return {"day": day, "mindset": engine.get_mindset(day)}


@mindset_router.put("/{day}", response_model=MindsetOut)
def set_mindset(day: str, payload: MindsetSet, engine: MindsetEngine = Depends(get_engine)):
    return {"day": day, "mindset": engine.set_mindset(day, payload.text)}


@design_today_router.get("/{day}", response_model=DesignTodayOut)
def get_design_today(day: str, engine: MindsetEngine = Depends(get_engine)):
    return {"day": day, "text": engine.get_design_today(day)}


@design_today_router.put("/{day}", response_model=DesignTodayOut)
def set_design_today(day: str, payload: DesignTodaySet, engine: MindsetEngine = Depends(get_engine)):
    return {"day": day, "text": engine.set_design_today(day, payload.text)}
