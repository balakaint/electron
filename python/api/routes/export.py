from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.schemas import BackupOut, CsvExportOut
from database.connection import get_db
from engine.export import build_backup, build_csv

router = APIRouter(prefix="/api/export", tags=["export"])


def _stamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


# No repository/engine-class layer here on purpose: export reads across
# every table and belongs to no single domain the way Task/Project/Goal
# do, so the route talks to engine.export's plain functions directly.
@router.get("/backup", response_model=BackupOut)
def get_backup(db: Session = Depends(get_db)):
    return {"filename": f"task_tracker_backup_{_stamp()}.json", "data": build_backup(db)}


@router.get("/csv", response_model=CsvExportOut)
def get_csv(db: Session = Depends(get_db)):
    return {"filename": f"task_tracker_export_{_stamp()}.csv", "csv": build_csv(db)}
