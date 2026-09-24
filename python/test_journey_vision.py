"""Journey's vision fields and "last move" (engine/journey.py).

    python python/test_journey_vision.py

Every test gets its own fresh temp SQLite DB, deleted immediately after
— never touches the real app.db.

What matters: the new fields read back as written (and trimmed), a bad
target date is refused without changing anything, pins keep only valid
entries and at most six, and "last move" is stamped by progress (a tick,
an added task or log) but not by edits or deletions.
"""

import os
import tempfile
import traceback
from datetime import date

from alembic import command
from alembic.config import Config

FAILURES = []


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}" + (f" — {detail}" if detail and not cond else ""))
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

        cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
        command.upgrade(cfg, "head")

        from database.repository import JourneyRepository
        from engine.journey import JourneyEngine

        self.db = connection.SessionLocal()
        self.repo = JourneyRepository(self.db)
        self.engine = JourneyEngine(self.repo)
        from database.models import ProjectJourney
        self.key = self.db.query(ProjectJourney).first().project_key
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


TODAY = str(date.today())


def test_new_fields_start_empty():
    with FreshDB() as f:
        j = f.engine.get(f.key)
        check("empty by default", (j["why"], j["vision"], j["vision_note"], j["target_date"], j["pins"], j["last_move"]) == ("", "", "", "", [], ""), str(j))


def test_fields_round_trip_trimmed():
    with FreshDB() as f:
        j = f.engine.update_meta(f.key, why="  for Amma ", vision=" 1,000 ", vision_note=" repeat customers ", target_date="2026-12-31")
        check("why trimmed", j["why"] == "for Amma")
        check("vision trimmed", j["vision"] == "1,000")
        check("vision_note trimmed", j["vision_note"] == "repeat customers")
        check("target date kept", j["target_date"] == "2026-12-31")
        j = f.engine.update_meta(f.key, tagline="x")
        check("unrelated update leaves them alone", j["why"] == "for Amma" and j["target_date"] == "2026-12-31")
        j = f.engine.update_meta(f.key, target_date="")
        check("target date can be cleared", j["target_date"] == "")


def test_bad_date_refused():
    with FreshDB() as f:
        f.engine.update_meta(f.key, target_date="2026-12-31")
        try:
            f.engine.update_meta(f.key, target_date="31/12/2026")
            check("bad date raises", False)
        except ValueError:
            check("bad date raises", True)
        f.db.rollback()
        check("bad date changed nothing", f.engine.get(f.key)["target_date"] == "2026-12-31")


def test_pins_cleaned_and_capped():
    with FreshDB() as f:
        pins = [{"kind": "word", "value": " Freedom "}, {"kind": "image", "value": "/p/a.png"},
                {"kind": "video", "value": "x"}, {"kind": "word", "value": "  "}]
        pins += [{"kind": "word", "value": f"w{i}"} for i in range(10)]
        j = f.engine.update_meta(f.key, pins=pins)
        check("invalid pins dropped, capped at 6", len(j["pins"]) == 6, str(j["pins"]))
        check("pin value trimmed", j["pins"][0] == {"kind": "word", "value": "Freedom"})
        check("image pin kept", j["pins"][1] == {"kind": "image", "value": "/p/a.png"})
        j = f.engine.update_meta(f.key, pins=[])
        check("pins can be cleared", j["pins"] == [])


def test_last_move_stamped_by_progress_only():
    with FreshDB() as f:
        f.engine.update_meta(f.key, why="w")
        f.engine.set_gate(f.key, 0, "gate")
        f.engine.update_stage_meta(f.key, 0, name="Renamed")
        check("edits do not stamp", f.engine.get(f.key)["last_move"] == "")
        j = f.engine.add_task(f.key, 0, "first task")
        check("adding a task stamps today", j["last_move"] == TODAY)
        from database.models import ProjectJourney
        row = f.db.get(ProjectJourney, f.key)
        row.last_move = "2026-01-01"
        f.db.commit()
        tid = j["stages"][0]["tasks"][0].id
        check("toggling a task stamps", f.engine.toggle_task(tid)["last_move"] == TODAY)
        row.last_move = "2026-01-01"
        f.db.commit()
        check("deleting does not stamp", f.engine.delete_task(tid)["last_move"] == "2026-01-01")
        check("ticking a gate stamps", f.engine.toggle_gate(f.key, 0)["last_move"] == TODAY)
        row.last_move = "2026-01-01"
        f.db.commit()
        check("adding a log stamps", f.engine.add_log(f.key, 1, "tried X")["last_move"] == TODAY)


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
