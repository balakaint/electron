import time

from database.models import Note, NoteHead
from database.repository import NoteRepository


def _now() -> float:
    return time.time()


_UNSET = object()
HEAD_NAME_MAX = 30


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

    def create_note(self, body: str = "", head_id: int | None = None) -> dict:
        self._check_head(head_id)
        now = _now()
        note = Note(
            id=int(now * 1000),
            body=body,
            pinned=False,
            created_at=now,
            updated_at=now,
            deleted_at=None,
            head_id=head_id,
        )
        return self._out(self.repo.add(note))

    def edit_note(self, note_id: int, body: str | None = None, pinned: bool | None = None,
                  head_id=_UNSET) -> dict | None:
        """`head_id` left out = unchanged; None = no head."""
        note = self.repo.get(note_id)
        if note is None or note.deleted_at is not None:
            return None
        if body is not None:
            note.body = body
        if pinned is not None:
            note.pinned = pinned
        if head_id is not _UNSET:
            self._check_head(head_id)
            note.head_id = head_id
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

    # ── heads ────────────────────────────────────────────────────────
    def _check_head(self, head_id: int | None) -> None:
        if head_id is not None and self.repo.get_head(head_id) is None:
            raise ValueError("No such head")

    @staticmethod
    def _clean_name(name: str) -> str:
        name = " ".join(name.split())
        if not name:
            raise ValueError("A head needs a name")
        if len(name) > HEAD_NAME_MAX:
            raise ValueError(f"Keep a head name to {HEAD_NAME_MAX} characters")
        return name

    def _name_taken(self, name: str, except_id: int | None = None) -> bool:
        return any(h.name.lower() == name.lower() and h.id != except_id for h in self.repo.heads())

    def list_heads(self) -> list[dict]:
        return [{"id": h.id, "name": h.name} for h in self.repo.heads()]

    def create_head(self, name: str) -> dict:
        name = self._clean_name(name)
        if name.lower() in ("all", "pinned") or self._name_taken(name):
            raise ValueError("That head already exists")
        heads = self.repo.heads()
        h = self.repo.add_head(NoteHead(id=int(_now() * 1000), name=name,
                                        sort_order=max((x.sort_order for x in heads), default=-1) + 1))
        return {"id": h.id, "name": h.name}

    def rename_head(self, head_id: int, name: str) -> dict | None:
        h = self.repo.get_head(head_id)
        if h is None:
            return None
        name = self._clean_name(name)
        if name.lower() in ("all", "pinned") or self._name_taken(name, head_id):
            raise ValueError("That head already exists")
        h.name = name
        self.repo.db.commit()
        return {"id": h.id, "name": h.name}

    def delete_head(self, head_id: int) -> bool:
        h = self.repo.get_head(head_id)
        if h is None:
            return False
        self.repo.delete_head(h)
        return True

    @staticmethod
    def _out(note: Note) -> dict:
        return {
            "id": note.id,
            "title": _title_from_body(note.body),
            "body": note.body,
            "pinned": note.pinned,
            "head_id": note.head_id,
            "created_at": note.created_at,
            "updated_at": note.updated_at,
        }
