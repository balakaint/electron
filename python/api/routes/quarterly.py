from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import (
    Q90AchievedSet,
    Q90AreaMetaSet,
    Q90AreaReorder,
    Q90CycleSet,
    Q90DestinationChange,
    Q90FieldSet,
    Q90MajorChangesSet,
    Q90PanelOut,
    Q90StrategyReset,
)
import engine.quarterly as quarterly
from database.connection import get_db
from database.repository import QuarterlyRepository

router = APIRouter(prefix="/api/quarterly", tags=["quarterly"])


def get_repo(db: Session = Depends(get_db)) -> QuarterlyRepository:
    return QuarterlyRepository(db)


@router.get("/panel", response_model=Q90PanelOut)
def read_panel(repo: QuarterlyRepository = Depends(get_repo)):
    return quarterly.get_panel(repo)


@router.post("/field", response_model=Q90PanelOut)
def write_field(payload: Q90FieldSet, repo: QuarterlyRepository = Depends(get_repo)):
    try:
        return quarterly.set_field(repo, payload.area, payload.field, payload.text)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/achieved", response_model=Q90PanelOut)
def write_achieved(payload: Q90AchievedSet, repo: QuarterlyRepository = Depends(get_repo)):
    try:
        return quarterly.set_achieved(repo, payload.area, payload.achieved)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/major-changes", response_model=Q90PanelOut)
def write_major_changes(payload: Q90MajorChangesSet, repo: QuarterlyRepository = Depends(get_repo)):
    try:
        changes = [c.model_dump() for c in payload.changes]
        return quarterly.set_major_changes(repo, payload.area, changes)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/change-goal", response_model=Q90PanelOut)
def write_change_goal(payload: Q90DestinationChange, repo: QuarterlyRepository = Depends(get_repo)):
    try:
        return quarterly.change_destination(
            repo, payload.area, payload.new_destination, payload.reason, payload.evidence
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/change-strategy", response_model=Q90PanelOut)
def write_change_strategy(payload: Q90StrategyReset, repo: QuarterlyRepository = Depends(get_repo)):
    try:
        return quarterly.reset_strategy(repo, payload.area)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/area-meta", response_model=Q90PanelOut)
def write_area_meta(payload: Q90AreaMetaSet, repo: QuarterlyRepository = Depends(get_repo)):
    try:
        return quarterly.set_area_meta(repo, payload.area, payload.field, payload.text)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/reorder-areas", response_model=Q90PanelOut)
def write_reorder_areas(payload: Q90AreaReorder, repo: QuarterlyRepository = Depends(get_repo)):
    try:
        return quarterly.reorder_areas(repo, payload.order)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/cycle", response_model=Q90PanelOut)
def write_cycle(payload: Q90CycleSet, repo: QuarterlyRepository = Depends(get_repo)):
    try:
        return quarterly.set_cycle(repo, payload.start, payload.days)
    except ValueError as e:
        raise HTTPException(400, str(e))
