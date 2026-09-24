from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.connection import get_db
from database.repository import HealthRepository
from engine.health import HealthEngine

router = APIRouter(prefix="/api/health", tags=["health"])


class ProfileIn(BaseModel):
    age: int
    sex: Literal["male", "female"]
    height_cm: float
    weight_kg: float
    goal: Literal["lose", "maintain", "gain"]
    activity: Literal["low", "moderate", "high"]
    place: Literal["home", "gym"] = "home"
    start_date: str | None = None


class RestartIn(BaseModel):
    start_date: str | None = None


class MealIn(BaseModel):
    day: str
    slot: int
    done: bool


class MoveIn(BaseModel):
    day: str
    key: str
    done: bool


class WaterIn(BaseModel):
    day: str
    delta: int


def get_engine(db: Session = Depends(get_db)) -> HealthEngine:
    return HealthEngine(HealthRepository(db))


def _wrap(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/state")
def read_state(day: str | None = None, engine: HealthEngine = Depends(get_engine)):
    return _wrap(engine.state, day)


@router.put("/profile")
def set_profile(payload: ProfileIn, engine: HealthEngine = Depends(get_engine)):
    return _wrap(engine.set_profile, **payload.model_dump())


@router.post("/restart")
def restart(payload: RestartIn, engine: HealthEngine = Depends(get_engine)):
    return _wrap(engine.restart, payload.start_date)


@router.post("/meal")
def set_meal(payload: MealIn, engine: HealthEngine = Depends(get_engine)):
    return _wrap(engine.set_meal, payload.day, payload.slot, payload.done)


@router.post("/move")
def set_move(payload: MoveIn, engine: HealthEngine = Depends(get_engine)):
    return _wrap(engine.set_move, payload.day, payload.key, payload.done)


@router.post("/water")
def add_water(payload: WaterIn, engine: HealthEngine = Depends(get_engine)):
    return _wrap(engine.add_water, payload.day, payload.delta)
