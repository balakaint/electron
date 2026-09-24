from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.schemas import NightClosureNight, NightClosureOut, NightClosureTextSet, NightClosureTimeSet
from database.connection import get_db
from database.repository import NightClosureRepository
from engine.night_closure import NightClosureEngine

router = APIRouter(prefix="/api/night-closure", tags=["night-closure"])


def get_engine(db: Session = Depends(get_db)) -> NightClosureEngine:
    return NightClosureEngine(NightClosureRepository(db))


@router.get("/today", response_model=NightClosureOut)
def read_today(engine: NightClosureEngine = Depends(get_engine)):
    return engine.get_today()


@router.get("/recent", response_model=list[NightClosureNight])
def read_recent(days: int = 7, engine: NightClosureEngine = Depends(get_engine)):
    """The last `days` nights (1-31), oldest first — for the Discipline
    card's week of closure marks."""
    return engine.recent(max(1, min(days, 31)))


@router.post("/where-stopped", response_model=NightClosureOut)
def set_where_stopped(payload: NightClosureTextSet, engine: NightClosureEngine = Depends(get_engine)):
    return engine.set_where_stopped(payload.text)


@router.post("/unfinished", response_model=NightClosureOut)
def set_unfinished(payload: NightClosureTextSet, engine: NightClosureEngine = Depends(get_engine)):
    return engine.set_unfinished(payload.text)


@router.post("/tomorrow-outcome", response_model=NightClosureOut)
def set_tomorrow_outcome(payload: NightClosureTextSet, engine: NightClosureEngine = Depends(get_engine)):
    return engine.set_tomorrow_outcome(payload.text)


@router.post("/tomorrow-first-action", response_model=NightClosureOut)
def set_tomorrow_first_action(payload: NightClosureTextSet, engine: NightClosureEngine = Depends(get_engine)):
    return engine.set_tomorrow_first_action(payload.text)


@router.post("/blocker", response_model=NightClosureOut)
def set_blocker(payload: NightClosureTextSet, engine: NightClosureEngine = Depends(get_engine)):
    return engine.set_optional_blocker(payload.text)


@router.post("/note", response_model=NightClosureOut)
def set_note(payload: NightClosureTextSet, engine: NightClosureEngine = Depends(get_engine)):
    return engine.set_optional_note(payload.text)


@router.post("/close-time", response_model=NightClosureOut)
def set_close_time(payload: NightClosureTimeSet, engine: NightClosureEngine = Depends(get_engine)):
    return engine.set_close_time(payload.value)


@router.post("/close", response_model=NightClosureOut)
def close_day(engine: NightClosureEngine = Depends(get_engine)):
    return engine.close_day()
