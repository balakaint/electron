from fastapi import APIRouter, Depends, HTTPException

from api.schemas import HourPlanOut, HourSlotOut, HourSlotSet
from database.connection import get_db
from database.repository import HourPlanRepository, ProjectRepository, TaskRepository
from engine.timer_reconciliation import stop_task_and_project
from engine.hour_plan import HourPlanEngine

router = APIRouter(prefix="/api/hours", tags=["hours"])


def get_engine(db=Depends(get_db)) -> HourPlanEngine:
    return HourPlanEngine(HourPlanRepository(db))


@router.get("/{day}", response_model=HourPlanOut)
def get_day(day: str, engine: HourPlanEngine = Depends(get_engine)):
    return engine.day(day)


@router.put("/{day}/{hour}", response_model=HourSlotOut)
def set_slot(
    day: str,
    hour: int,
    payload: HourSlotSet,
    engine: HourPlanEngine = Depends(get_engine),
    db=Depends(get_db),
):
    try:
        result = engine.set_slot(day, hour, text=payload.text, done=payload.done, repeat=payload.repeat)
        # Ticking the hour finishes the task it started, and stops its
        # clock. The other direction is handled in NowEngine.complete;
        # both exist because either control is a reasonable place to say
        # "done" and neither should leave the other one lying.
        if payload.done is not None:
            tasks = TaskRepository(db)
            slot = next((s for s in HourPlanRepository(db).hour_slots(day) if s.hour == hour), None)
            linked = tasks.get_by_hour_slot(slot.id) if slot is not None else None
            if linked is not None and linked.done != bool(payload.done):
                if bool(payload.done):
                    stop_task_and_project(tasks, ProjectRepository(db), linked)
                linked.done = bool(payload.done)
                tasks.save(linked)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
