import time

from database.models import Note
from database.repository import NoteRepository


def _now() -> float:
    return time.time()


def _title_from_body(body: str) -> str:
    """The note's own first non-blank line, capped short — see Note's
    own docstring for why this is derived rather than a stored field."""
    first_line = next((ln.strip() for ln in body.splitlines() if ln.strip()), "")
    return first_line[:80] if first_line else "Untitled"


class NoteEngine:
    def __init__(self, repo: NoteRepository):
        self.repo = repo

    def list_notes(self) -> list[dict]:
        return [self._out(n) for n in self.repo.list()]

    def create_note(self, body: str = "") -> dict:
        now = _now()
        note = Note(
            id=int(now * 1000),
            body=body,
            pinned=False,
            created_at=now,
            updated_at=now,
            deleted_at=None,
        )
        return self._out(self.repo.add(note))

    def edit_note(self, note_id: int, body: str | None = None, pinned: bool | None = None) -> dict | None:
        note = self.repo.get(note_id)
        if note is None or note.deleted_at is not None:
            return None
        if body is not None:
            note.body = body
        if pinned is not None:
            note.pinned = pinned
        note.updated_at = _now()
        return self._out(self.repo.save(note))

    def delete_note(self, note_id: int) -> bool:
        """Soft-delete only — see Note's own docstring. Never touches an
        already-deleted row, so a stray double-delete (e.g. a replayed
        undo/redo edge case) can't reset its deleted_at timestamp."""
        note = self.repo.get(note_id)
        if note is None or note.deleted_at is not None:
            return False
        note.deleted_at = _now()
        self.repo.save(note)
        return True

    def restore_note(self, note_id: int) -> dict | None:
        """The Ctrl+Z path — renderer's global undo stack calls this
        after a delete, see undo.tsx."""
        note = self.repo.get(note_id)
        if note is None or note.deleted_at is None:
            return None
        note.deleted_at = None
        note.updated_at = _now()
        return self._out(self.repo.save(note))

    @staticmethod
    def _out(note: Note) -> dict:
        return {
            "id": note.id,
            "title": _title_from_body(note.body),
            "body": note.body,
            "pinned": note.pinned,
            "created_at": note.created_at,
            "updated_at": note.updated_at,
        }
