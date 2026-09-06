from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import SettingsOut, SettingsUpdate, ThemeSet
from database.connection import get_db
from database.repository import TaskRepository
from engine.settings import get_settings, set_onboarded, set_theme, update_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_repo(db: Session = Depends(get_db)) -> TaskRepository:
    return TaskRepository(db)


@router.get("", response_model=SettingsOut)
def read_settings(repo: TaskRepository = Depends(get_repo)):
    return get_settings(repo)


@router.put("", response_model=SettingsOut)
def write_settings(payload: SettingsUpdate, repo: TaskRepository = Depends(get_repo)):
    try:
        return update_settings(repo, **payload.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/theme", response_model=SettingsOut)
def update_theme(payload: ThemeSet, repo: TaskRepository = Depends(get_repo)):
    try:
        return set_theme(repo, payload.theme)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/onboarded", response_model=SettingsOut)
def mark_onboarded(repo: TaskRepository = Depends(get_repo)):
    return set_onboarded(repo, True)
