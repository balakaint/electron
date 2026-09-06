from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import (
    BdpActionCreate,
    BdpActionEdit,
    BdpMove,
    BdpPlanCreate,
    BdpPlanEdit,
    BdpPlanOut,
    BdpSortOut,
    BdpSortSet,
    BdpStatusT,
)
import engine.bdp as bdp
from database.connection import get_db
from database.repository import BdpRepository

router = APIRouter(prefix="/api/bdp", tags=["bdp"])


def get_repo(db: Session = Depends(get_db)) -> BdpRepository:
    return BdpRepository(db)


@router.get("/plans", response_model=list[BdpPlanOut])
def list_plans(
    status: BdpStatusT | None = None,
    priority: str | None = None,
    market: str | None = None,
    q: str | None = None,
    sort: str | None = None,
    include_archived: bool = False,
    repo: BdpRepository = Depends(get_repo),
):
    return bdp.list_plans(
        repo, status=status, priority=priority, market=market, q=q,
        sort=sort, include_archived=include_archived,
    )


@router.post("/plans", response_model=BdpPlanOut)
def create_plan(payload: BdpPlanCreate, repo: BdpRepository = Depends(get_repo)):
    try:
        return bdp.create_plan(repo, payload.title, **payload.model_dump(exclude={"title"}, exclude_unset=True))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/plans/{plan_id}", response_model=BdpPlanOut)
def edit_plan(plan_id: int, payload: BdpPlanEdit, repo: BdpRepository = Depends(get_repo)):
    plan = bdp.edit_plan(repo, plan_id, **payload.model_dump(exclude_unset=True))
    if plan is None:
        raise HTTPException(404, "Plan not found")
    return plan


@router.post("/plans/{plan_id}/duplicate", response_model=BdpPlanOut)
def duplicate_plan(plan_id: int, repo: BdpRepository = Depends(get_repo)):
    plan = bdp.duplicate_plan(repo, plan_id)
    if plan is None:
        raise HTTPException(404, "Plan not found")
    return plan


@router.post("/plans/{plan_id}/archive", response_model=BdpPlanOut)
def archive_plan(plan_id: int, repo: BdpRepository = Depends(get_repo)):
    plan = bdp.archive_plan(repo, plan_id)
    if plan is None:
        raise HTTPException(404, "Plan not found")
    return plan


@router.delete("/plans/{plan_id}")
def delete_plan(plan_id: int, repo: BdpRepository = Depends(get_repo)):
    if not bdp.delete_plan(repo, plan_id):
        raise HTTPException(404, "Plan not found")
    return {"ok": True}


@router.post("/plans/{plan_id}/move", response_model=list[BdpPlanOut])
def move_plan(plan_id: int, payload: BdpMove, repo: BdpRepository = Depends(get_repo)):
    try:
        return bdp.move_plan(repo, plan_id, payload.direction)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/sort", response_model=BdpSortOut)
def read_sort(repo: BdpRepository = Depends(get_repo)):
    return {"sort": bdp.get_sort(repo)}


@router.post("/sort", response_model=BdpSortOut)
def write_sort(payload: BdpSortSet, repo: BdpRepository = Depends(get_repo)):
    return {"sort": bdp.set_sort(repo, payload.sort)}


@router.post("/plans/{plan_id}/actions", response_model=BdpPlanOut)
def add_action(plan_id: int, payload: BdpActionCreate, repo: BdpRepository = Depends(get_repo)):
    try:
        return bdp.add_action(repo, plan_id, payload.text)
    except ValueError as e:
        raise HTTPException(400, str(e))


actions_router = APIRouter(prefix="/api/bdp/actions", tags=["bdp"])


@actions_router.put("/{action_id}", response_model=BdpPlanOut)
def edit_action(action_id: int, payload: BdpActionEdit, repo: BdpRepository = Depends(get_repo)):
    plan = bdp.edit_action(repo, action_id, payload.text)
    if plan is None:
        raise HTTPException(404, "Action not found")
    return plan


@actions_router.post("/{action_id}/toggle", response_model=BdpPlanOut)
def toggle_action(action_id: int, repo: BdpRepository = Depends(get_repo)):
    plan = bdp.toggle_action(repo, action_id)
    if plan is None:
        raise HTTPException(404, "Action not found")
    return plan


@actions_router.delete("/{action_id}", response_model=BdpPlanOut)
def delete_action(action_id: int, repo: BdpRepository = Depends(get_repo)):
    plan = bdp.delete_action(repo, action_id)
    if plan is None:
        raise HTTPException(404, "Action not found")
    return plan
