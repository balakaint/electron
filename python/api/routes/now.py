from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import TaskOut
from database.connection import get_db
from database.repository import ProjectRepository, TaskRepository
from engine.now import NowEngine
from engine.tasks import STRIKE_MAX, StrikeLimitReached

router = APIRouter(prefix="/api/now", tags=["now"])
# Same prefix as api.routes.projects's router, matching how goals.py
# already splits one feature across two routers with different prefixes
# — "+ STRIKE" is a project-subtask action backed by NowEngine.
strike_router = APIRouter(prefix="/api/projects", tags=["now"])


def get_engine(db: Session = Depends(get_db)) -> NowEngine:
    return NowEngine(TaskRepository(db), ProjectRepository(db))


@router.get("", response_model=TaskOut | None)
def get_now(engine: NowEngine = Depends(get_engine)):
    return engine.get()


# Static path first — must be declared before /{task_id}'s int
# converter is even attempted, matching the convention already used in
# api.routes.projects for /order and /today-progress.
@router.post("/toggle-run", response_model=TaskOut | None)
def toggle_run(engine: NowEngine = Depends(get_engine)):
    return engine.toggle_run()


@router.post("/complete", response_model=TaskOut | None)
def complete(engine: NowEngine = Depends(get_engine)):
    return engine.complete()


@router.post("/{task_id}", response_model=TaskOut | None)
def set_now(task_id: int, engine: NowEngine = Depends(get_engine)):
    return engine.set_now(task_id)


@strike_router.post("/subtasks/{pid}/strike", response_model=TaskOut)
def strike_project_task(pid: str, engine: NowEngine = Depends(get_engine)):
    try:
        return engine.strike_project_task(pid)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except StrikeLimitReached:
        raise HTTPException(409, f"Already {STRIKE_MAX}/{STRIKE_MAX} — full")
