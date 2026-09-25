"""NOTES heads (engine/notes.py).

    python python/test_note_heads.py

Fresh temp SQLite per test. What matters: heads are named, unique
(case-insensitive, and never "All"/"Pinned"); a note is created in or
moved to a head, and leaving head_id out of an edit keeps it; deleting
a head sends its notes back to no head rather than deleting them.
"""

import os
import tempfile
import time
import traceback

from alembic import command
from alembic.config import Config

FAILURES = []


def check(label, cond, detail=""):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(label)


class FreshDB:
    def __enter__(self):
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        os.environ["APP_DB_PATH"] = self.path
        import importlib
        import database.connection as connection
        importlib.reload(connection)
        command.upgrade(Config(os.path.join(os.path.dirname(__file__), "alembic.ini")), "head")
        from database.repository import NoteRepository
        from engine.notes import NoteEngine
        self.db = connection.SessionLocal()
        self.engine = NoteEngine(NoteRepository(self.db))
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


def raises(fn):
    try:
        fn()
        return False
    except ValueError:
        return True


def test_heads():
    with FreshDB() as f:
        e = f.engine
        ideas = e.create_head("  Ideas  ")
        check("name trimmed", ideas["name"] == "Ideas")
        time.sleep(0.002)
        meet = e.create_head("Meetings")
        check("listed in order", [h["name"] for h in e.list_heads()] == ["Ideas", "Meetings"])
        check("duplicate rejected (any case)", raises(lambda: e.create_head("ideas")))
        check("All/Pinned reserved", raises(lambda: e.create_head("Pinned")))
        check("empty rejected", raises(lambda: e.create_head("   ")))
        check("too long rejected", raises(lambda: e.create_head("x" * 31)))

        n = e.create_note("Launch idea\\nmore", ideas["id"])
        check("note created in a head", n["head_id"] == ideas["id"])
        check("unknown head rejected", raises(lambda: e.create_note("x", 999)))
        n = e.edit_note(n["id"], body="Launch idea v2")
        check("edit without head_id keeps the head", n["head_id"] == ideas["id"])
        n = e.edit_note(n["id"], head_id=meet["id"])
        check("moved to another head", n["head_id"] == meet["id"])
        n = e.edit_note(n["id"], head_id=None)
        check("head cleared", n["head_id"] is None)

        e.edit_note(n["id"], head_id=ideas["id"])
        check("rename", e.rename_head(ideas["id"], "Big ideas")["name"] == "Big ideas")
        check("rename to a taken name rejected", raises(lambda: e.rename_head(ideas["id"], "meetings")))
        check("delete head", e.delete_head(ideas["id"]))
        notes = e.list_notes()
        check("its note survives with no head", len(notes) == 1 and notes[0]["head_id"] is None)
        check("delete missing head", e.delete_head(ideas["id"]) is False)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
            except Exception:
                traceback.print_exc()
                FAILURES.append(name)
    print()
    print("ALL PASS" if not FAILURES else f"{len(FAILURES)} FAILED: {FAILURES}")
    raise SystemExit(1 if FAILURES else 0)
