from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import HabitCheckin, HabitCreate, HabitEdit, HabitItemOut, HabitReorder
import engine.habits as habits
from database.connection import get_db
from database.repository import HabitRepository

router = APIRouter(prefix="/api/habits", tags=["habits"])


def get_repo(db: Session = Depends(get_db)) -> HabitRepository:
    return HabitRepository(db)


@router.get("", response_model=list[HabitItemOut])
def list_habits(repo: HabitRepository = Depends(get_repo)):
    return habits.list_habits(repo)


@router.post("", response_model=list[HabitItemOut])
def create_habit(payload: HabitCreate, repo: HabitRepository = Depends(get_repo)):
    try:
        return habits.create_habit(repo, payload.kind, payload.name, payload.time, payload.priority, payload.tracking_basis)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/{item_id}", response_model=list[HabitItemOut])
def edit_habit(item_id: int, payload: HabitEdit, repo: HabitRepository = Depends(get_repo)):
    try:
        return habits.edit_habit(repo, item_id, payload.name, payload.time, payload.priority, payload.tracking_basis)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{item_id}/checkin", response_model=list[HabitItemOut])
def checkin(item_id: int, payload: HabitCheckin, repo: HabitRepository = Depends(get_repo)):
    try:
        return habits.checkin(repo, item_id, payload.date, payload.done)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/{item_id}", response_model=list[HabitItemOut])
def delete_habit(item_id: int, repo: HabitRepository = Depends(get_repo)):
    return habits.delete_habit(repo, item_id)


@router.post("/reorder", response_model=list[HabitItemOut])
def reorder(payload: HabitReorder, repo: HabitRepository = Depends(get_repo)):
    return habits.reorder(repo, payload.ids)
