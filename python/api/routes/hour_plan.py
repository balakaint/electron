from fastapi import APIRouter, Depends, HTTPException

from api.schemas import HourPlanOut, HourSlotOut, HourSlotSet
from database.connection import get_db
from database.repository import HourPlanRepository
from engine.hour_plan import HourPlanEngine

router = APIRouter(prefix="/api/hours", tags=["hours"])


def get_engine(db=Depends(get_db)) -> HourPlanEngine:
    return HourPlanEngine(HourPlanRepository(db))


@router.get("/{day}", response_model=HourPlanOut)
def get_day(day: str, engine: HourPlanEngine = Depends(get_engine)):
    return engine.day(day)


@router.put("/{day}/{hour}", response_model=HourSlotOut)
def set_slot(day: str, hour: int, payload: HourSlotSet, engine: HourPlanEngine = Depends(get_engine)):
    try:
        return engine.set_slot(day, hour, text=payload.text, done=payload.done)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
