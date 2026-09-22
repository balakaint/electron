from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import NoteCreate, NoteEdit, NoteOut
from database.connection import get_db
from database.repository import NoteRepository
from engine.notes import NoteEngine

router = APIRouter(prefix="/api/notes", tags=["notes"])


def get_engine(db: Session = Depends(get_db)) -> NoteEngine:
    return NoteEngine(NoteRepository(db))


@router.get("", response_model=list[NoteOut])
def list_notes(engine: NoteEngine = Depends(get_engine)):
    return engine.list_notes()


@router.post("", response_model=NoteOut)
def create_note(payload: NoteCreate, engine: NoteEngine = Depends(get_engine)):
    return engine.create_note(payload.body)


@router.put("/{note_id}", response_model=NoteOut)
def edit_note(note_id: int, payload: NoteEdit, engine: NoteEngine = Depends(get_engine)):
    note = engine.edit_note(note_id, payload.body, payload.pinned)
    if note is None:
        raise HTTPException(404, "Note not found")
    return note


@router.delete("/{note_id}")
def delete_note(note_id: int, engine: NoteEngine = Depends(get_engine)):
    if not engine.delete_note(note_id):
        raise HTTPException(404, "Note not found")
    return {"ok": True}


@router.post("/{note_id}/restore", response_model=NoteOut)
def restore_note(note_id: int, engine: NoteEngine = Depends(get_engine)):
    note = engine.restore_note(note_id)
    if note is None:
        raise HTTPException(404, "Note not found")
    return note
