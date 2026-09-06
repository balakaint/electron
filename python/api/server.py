import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from api.routes.bdp import actions_router as bdp_actions_router, router as bdp_router
from api.routes.business_analysis import router as business_analysis_router
from api.routes.export import router as export_router
from api.routes.goals import panel_router as goals_panel_router, router as goals_router
from api.routes.habits import intentions_router, router as habits_router
from api.routes.journey import (
    logs_router as journey_logs_router,
    router as journey_router,
    tasks_router as journey_tasks_router,
)
from api.routes.now import router as now_router, strike_router as now_strike_router
from api.routes.projects import circle_router, router as projects_router
from api.routes.settings import router as settings_router
from api.routes.tasks import router as tasks_router
from database.connection import SessionLocal
from database.repository import ProjectRepository, TaskRepository
from engine.tasks import reset_strike_if_new_day
from engine.timer_reconciliation import reconcile_all_projects, reconcile_all_tasks

RECONCILE_INTERVAL_SECS = 60


def _reconcile_once() -> None:
    """Credit/cap any running project or open task timer against real
    elapsed time. Run once at startup (catches a stale timer left over
    from a crash or a closed app) and every RECONCILE_INTERVAL_SECS
    while the engine is alive (keeps checkpoints fresh so a *later*
    crash only loses ~1 minute, not a whole session) — see
    engine.timer_reconciliation for why both call sites matter."""
    db = SessionLocal()
    try:
        task_repo = TaskRepository(db)
        idle_limit_secs = task_repo.get_app_state().idle_stop_min * 60
        reconcile_all_projects(ProjectRepository(db), idle_limit_secs=idle_limit_secs)
        reconcile_all_tasks(task_repo, idle_limit_secs=idle_limit_secs)
        reset_strike_if_new_day(task_repo)
        db.commit()
    finally:
        db.close()


async def _reconcile_loop() -> None:
    while True:
        await asyncio.sleep(RECONCILE_INTERVAL_SECS)
        _reconcile_once()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _reconcile_once()
    task = asyncio.create_task(_reconcile_loop())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="Habit OS Engine", lifespan=lifespan)
app.include_router(tasks_router)
app.include_router(habits_router)
app.include_router(intentions_router)
app.include_router(projects_router)
app.include_router(circle_router)
app.include_router(business_analysis_router)
app.include_router(goals_router)
app.include_router(goals_panel_router)
app.include_router(export_router)
app.include_router(now_router)
app.include_router(now_strike_router)
app.include_router(journey_router)
app.include_router(journey_tasks_router)
app.include_router(journey_logs_router)
app.include_router(settings_router)
app.include_router(bdp_router)
app.include_router(bdp_actions_router)


@app.get("/health")
def health():
    return {"status": "ok"}
