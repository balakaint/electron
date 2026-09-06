from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import Q90AnswerSet, Q90CycleSet, Q90PanelOut
import engine.quarterly as quarterly
from database.connection import get_db
from database.repository import QuarterlyRepository

router = APIRouter(prefix="/api/quarterly", tags=["quarterly"])


def get_repo(db: Session = Depends(get_db)) -> QuarterlyRepository:
    return QuarterlyRepository(db)


@router.get("/panel", response_model=Q90PanelOut)
def read_panel(repo: QuarterlyRepository = Depends(get_repo)):
    return quarterly.get_panel(repo)


@router.post("/answer", response_model=Q90PanelOut)
def write_answer(payload: Q90AnswerSet, repo: QuarterlyRepository = Depends(get_repo)):
    try:
        return quarterly.set_answer(repo, payload.area, payload.field, payload.text)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/cycle", response_model=Q90PanelOut)
def write_cycle(payload: Q90CycleSet, repo: QuarterlyRepository = Depends(get_repo)):
    try:
        return quarterly.set_cycle(repo, payload.start, payload.days)
    except ValueError as e:
        raise HTTPException(400, str(e))
