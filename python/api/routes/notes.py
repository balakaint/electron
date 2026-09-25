from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import NoteCreate, NoteEdit, NoteHeadIn, NoteHeadOut, NoteOut
from database.connection import get_db
from database.repository import NoteRepository
from engine.notes import NoteEngine

router = APIRouter(prefix="/api/notes", tags=["notes"])


def get_engine(db: Session = Depends(get_db)) -> NoteEngine:
    return NoteEngine(NoteRepository(db))


@router.get("", response_model=list[NoteOut])
def list_notes(engine: NoteEngine = Depends(get_engine)):
    return engine.list_notes()


# Heads are declared before "/{note_id}" so "/heads" never parses as an id.
@router.get("/heads", response_model=list[NoteHeadOut])
def list_heads(engine: NoteEngine = Depends(get_engine)):
    return engine.list_heads()


@router.post("/heads", response_model=NoteHeadOut)
def create_head(payload: NoteHeadIn, engine: NoteEngine = Depends(get_engine)):
    try:
        return engine.create_head(payload.name)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/heads/{head_id}", response_model=NoteHeadOut)
def rename_head(head_id: int, payload: NoteHeadIn, engine: NoteEngine = Depends(get_engine)):
    try:
        h = engine.rename_head(head_id, payload.name)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if h is None:
        raise HTTPException(404, "Head not found")
    return h


@router.delete("/heads/{head_id}")
def delete_head(head_id: int, engine: NoteEngine = Depends(get_engine)):
    if not engine.delete_head(head_id):
        raise HTTPException(404, "Head not found")
    return {"ok": True}


@router.post("", response_model=NoteOut)
def create_note(payload: NoteCreate, engine: NoteEngine = Depends(get_engine)):
    try:
        return engine.create_note(payload.body, payload.head_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/{note_id}", response_model=NoteOut)
def edit_note(note_id: int, payload: NoteEdit, engine: NoteEngine = Depends(get_engine)):
    extra = {"head_id": payload.head_id} if "head_id" in payload.model_fields_set else {}
    try:
        note = engine.edit_note(note_id, payload.body, payload.pinned, **extra)
    except ValueError as e:
        raise HTTPException(400, str(e))
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
