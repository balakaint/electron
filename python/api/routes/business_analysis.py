from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import (
    BusinessAnalysisOut,
    BusinessAnalysisUpdate,
    DecisionLogOut,
    DecisionStatusSet,
    LegacyBoxOut,
    PrioritySet,
    ProjectKeyT,
)
from database.connection import get_db
from database.repository import BusinessAnalysisRepository
from engine.business_analysis import BusinessAnalysisEngine

router = APIRouter(prefix="/api/projects/{key}/analysis", tags=["business_analysis"])


def get_engine(db: Session = Depends(get_db)) -> BusinessAnalysisEngine:
    return BusinessAnalysisEngine(BusinessAnalysisRepository(db))


@router.get("", response_model=BusinessAnalysisOut)
def get_analysis(key: ProjectKeyT, engine: BusinessAnalysisEngine = Depends(get_engine)):
    ba = engine.get(key)
    if ba is None:
        raise HTTPException(404, "Business analysis not found")
    return ba


@router.put("", response_model=BusinessAnalysisOut)
def update_analysis(
    key: ProjectKeyT, payload: BusinessAnalysisUpdate, engine: BusinessAnalysisEngine = Depends(get_engine)
):
    ba = engine.update(key, **payload.model_dump(exclude_unset=True))
    if ba is None:
        raise HTTPException(404, "Business analysis not found")
    return ba


@router.post("/decision-status", response_model=BusinessAnalysisOut)
def set_decision_status(
    key: ProjectKeyT, payload: DecisionStatusSet, engine: BusinessAnalysisEngine = Depends(get_engine)
):
    ba = engine.set_decision_status(key, payload.status)
    if ba is None:
        raise HTTPException(404, "Business analysis not found")
    return ba


@router.post("/priority", response_model=BusinessAnalysisOut)
def set_priority(key: ProjectKeyT, payload: PrioritySet, engine: BusinessAnalysisEngine = Depends(get_engine)):
    ba = engine.set_priority(key, payload.priority)
    if ba is None:
        raise HTTPException(404, "Business analysis not found")
    return ba


@router.get("/log", response_model=list[DecisionLogOut])
def get_log(key: ProjectKeyT, engine: BusinessAnalysisEngine = Depends(get_engine)):
    return engine.get_log(key)


@router.get("/legacy-boxes", response_model=list[LegacyBoxOut])
def get_legacy_boxes(key: ProjectKeyT, engine: BusinessAnalysisEngine = Depends(get_engine)):
    return engine.get_legacy_boxes(key)
