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


class MealItem(BaseModel):
    food: str
    qty: float = 1


class MealItemsIn(BaseModel):
    day: str
    slot: int
    items: list[MealItem]
    scope: Literal["day", "weekday", "all"] = "day"


class Move(BaseModel):
    name: str
    dose: str = ""


class BlockMovesIn(BaseModel):
    day: str
    block: int
    moves: list[Move]
    scope: Literal["day", "weekday", "all"] = "day"


class ResetIn(BaseModel):
    day: str
    scope: Literal["day", "weekday", "all"]


class DietIn(BaseModel):
    diet: list[str]


class DislikeIn(BaseModel):
    food: str
    dislike: bool


@router.put("/meal-items")
def set_meal_items(payload: MealItemsIn, engine: HealthEngine = Depends(get_engine)):
    return _wrap(engine.set_meal_items, payload.day, payload.slot, [i.model_dump() for i in payload.items], payload.scope)


@router.put("/block-moves")
def set_block_moves(payload: BlockMovesIn, engine: HealthEngine = Depends(get_engine)):
    return _wrap(engine.set_block_moves, payload.day, payload.block, [m.model_dump() for m in payload.moves], payload.scope)


@router.post("/reset")
def reset(payload: ResetIn, engine: HealthEngine = Depends(get_engine)):
    return _wrap(engine.reset, payload.day, payload.scope)


@router.put("/diet")
def set_diet(payload: DietIn, engine: HealthEngine = Depends(get_engine)):
    return _wrap(engine.set_diet, payload.diet)


@router.post("/dislike")
def set_dislike(payload: DislikeIn, engine: HealthEngine = Depends(get_engine)):
    return _wrap(engine.set_dislike, payload.food, payload.dislike)


@router.get("/library")
def library(engine: HealthEngine = Depends(get_engine)):
    return _wrap(engine.library)


@router.get("/swaps")
def swaps(food: str, engine: HealthEngine = Depends(get_engine)):
    return _wrap(engine.swaps, food)
