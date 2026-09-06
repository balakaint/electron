from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import (
    ActivityEntry,
    ManualMarkSet,
    PersonCreate,
    PersonOut,
    PersonUpdate,
    ProjectKeyT,
    ProjectOrderEntry,
    ProjectOut,
    ProjectUpdate,
    SubtaskCreate,
    SubtaskOut,
    TargetBump,
    TodayProgressOut,
)
from database.connection import get_db
from database.repository import ProjectRepository
from engine.projects import ProjectEngine

router = APIRouter(prefix="/api/projects", tags=["projects"])
circle_router = APIRouter(prefix="/api/circle", tags=["circle"])


def get_engine(db: Session = Depends(get_db)) -> ProjectEngine:
    return ProjectEngine(ProjectRepository(db))


def _require_project(engine: ProjectEngine, key: str):
    project = engine.get_project(key)
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


# Static-path routes must be declared before the /{key} catch-all, or
# Starlette matches "order"/"today-progress" as a literal key value.
@router.get("/order", response_model=list[ProjectOrderEntry])
def project_order(engine: ProjectEngine = Depends(get_engine)):
    return engine.project_order()


@router.get("/today-progress", response_model=TodayProgressOut)
def today_progress(engine: ProjectEngine = Depends(get_engine)):
    return engine.today_progress()


@router.get("", response_model=list[ProjectOut])
def list_projects(engine: ProjectEngine = Depends(get_engine)):
    return [engine.project_to_dict(p) for p in engine.list_projects()]


@router.get("/{key}", response_model=ProjectOut)
def get_project(key: ProjectKeyT, engine: ProjectEngine = Depends(get_engine)):
    project = _require_project(engine, key)
    return engine.project_to_dict(project)


@router.put("/{key}", response_model=ProjectOut)
def update_project(key: ProjectKeyT, payload: ProjectUpdate, engine: ProjectEngine = Depends(get_engine)):
    _require_project(engine, key)
    project = engine.update_project(key, **payload.model_dump(exclude_unset=True))
    return engine.project_to_dict(project)


@router.post("/{key}/target", response_model=ProjectOut)
def bump_target(key: ProjectKeyT, payload: TargetBump, engine: ProjectEngine = Depends(get_engine)):
    _require_project(engine, key)
    project = engine.bump_target(key, payload.delta)
    return engine.project_to_dict(project)


@router.post("/{key}/toggle-timer", response_model=ProjectOut)
def toggle_timer(key: ProjectKeyT, engine: ProjectEngine = Depends(get_engine)):
    _require_project(engine, key)
    project = engine.toggle_timer(key)
    return engine.project_to_dict(project)


@router.get("/{key}/activity", response_model=list[ActivityEntry])
def activity_strip(key: ProjectKeyT, days: int = 30, engine: ProjectEngine = Depends(get_engine)):
    _require_project(engine, key)
    return engine.activity_strip(key, days)


@router.post("/{key}/mark")
def set_manual_mark(key: ProjectKeyT, payload: ManualMarkSet, engine: ProjectEngine = Depends(get_engine)):
    _require_project(engine, key)
    engine.set_manual_mark(key, payload.day, payload.mark)
    return {"ok": True}


@router.get("/{key}/subtasks", response_model=list[SubtaskOut])
def list_subtasks(key: ProjectKeyT, engine: ProjectEngine = Depends(get_engine)):
    _require_project(engine, key)
    return engine.list_subtasks(key)


@router.post("/{key}/subtasks", response_model=SubtaskOut)
def add_subtask(key: ProjectKeyT, payload: SubtaskCreate, engine: ProjectEngine = Depends(get_engine)):
    _require_project(engine, key)
    try:
        return engine.add_subtask(key, payload.text)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/subtasks/{pid}/toggle", response_model=SubtaskOut)
def toggle_subtask(pid: str, engine: ProjectEngine = Depends(get_engine)):
    subtask = engine.toggle_subtask(pid)
    if subtask is None:
        raise HTTPException(404, "Subtask not found")
    return subtask


@router.delete("/subtasks/{pid}")
def delete_subtask(pid: str, engine: ProjectEngine = Depends(get_engine)):
    if not engine.delete_subtask(pid):
        raise HTTPException(404, "Subtask not found")
    return {"ok": True}


@circle_router.get("", response_model=list[PersonOut])
def list_people(project_key: ProjectKeyT | None = None, engine: ProjectEngine = Depends(get_engine)):
    return engine.list_people(project_key)


@circle_router.post("", response_model=PersonOut)
def add_person(payload: PersonCreate, engine: ProjectEngine = Depends(get_engine)):
    try:
        return engine.add_person(payload.project_key, payload.name, payload.cadence_days)
    except ValueError as e:
        raise HTTPException(400, str(e))


@circle_router.put("/{person_id}", response_model=PersonOut)
def update_person(person_id: int, payload: PersonUpdate, engine: ProjectEngine = Depends(get_engine)):
    person = engine.update_person(person_id, payload.name, payload.cadence_days)
    if person is None:
        raise HTTPException(404, "Person not found")
    return person


@circle_router.post("/{person_id}/mark-contacted", response_model=PersonOut)
def mark_contacted(person_id: int, engine: ProjectEngine = Depends(get_engine)):
    person = engine.mark_contacted(person_id)
    if person is None:
        raise HTTPException(404, "Person not found")
    return person


@circle_router.post("/{person_id}/adopt", response_model=PersonOut)
def adopt_person(person_id: int, project_key: ProjectKeyT, engine: ProjectEngine = Depends(get_engine)):
    person = engine.adopt_person(person_id, project_key)
    if person is None:
        raise HTTPException(404, "Person not found, or already assigned to a project")
    return person


@circle_router.delete("/{person_id}")
def delete_person(person_id: int, engine: ProjectEngine = Depends(get_engine)):
    if not engine.delete_person(person_id):
        raise HTTPException(404, "Person not found")
    return {"ok": True}
