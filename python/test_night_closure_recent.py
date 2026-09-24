"""Night Closure's week view (engine/night_closure.py: recent).

    python python/test_night_closure_recent.py

Every test gets its own fresh temp SQLite DB, deleted immediately after
— never touches the real app.db.

The Discipline card draws the last seven nights from this. What matters:
the order (oldest first, ending tonight), that a closed night reads as
closed and an untouched one as not, that the count of written fields is
right — and that looking does not write: a week of empty nights must
not create a week of empty rows.
"""

import os
import tempfile
import traceback

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

        from database.repository import NightClosureRepository
        from engine.night_closure import NightClosureEngine

        self.db = connection.SessionLocal()
        self.repo = NightClosureRepository(self.db)
        self.engine = NightClosureEngine(self.repo)
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


def _row(f, day, closed=False, **fields):
    row = f.repo.get_or_create(day)
    for k, v in fields.items():
        setattr(row, k, v)
    if closed:
        row.closed_at = 1.0
    f.repo.save(row)


def test_order_ends_tonight_oldest_first():
    with FreshDB() as f:
        nights = f.engine.recent(7, today="2026-09-25")
        check("seven nights", len(nights) == 7, str(len(nights)))
        check("oldest first", nights[0]["day"] == "2026-09-19", nights[0]["day"])
        check("ends tonight", nights[-1]["day"] == "2026-09-25", nights[-1]["day"])


def test_crosses_a_month_boundary():
    with FreshDB() as f:
        nights = f.engine.recent(3, today="2026-10-01")
        check("30 Sep, then 1 Oct", [n["day"] for n in nights] == ["2026-09-29", "2026-09-30", "2026-10-01"], str(nights))


def test_closed_and_written_are_read_from_the_row():
    with FreshDB() as f:
        _row(f, "2026-09-23", closed=True, where_stopped="a", unfinished="b", tomorrow_outcome="c", tomorrow_first_action="d")
        _row(f, "2026-09-24", where_stopped="only this", tomorrow_outcome="   ")
        by_day = {n["day"]: n for n in f.engine.recent(7, today="2026-09-25")}
        check("a closed night is closed", by_day["2026-09-23"]["closed"] is True)
        check("with all four written", by_day["2026-09-23"]["written"] == 4, str(by_day["2026-09-23"]))
        check("an open night is not closed", by_day["2026-09-24"]["closed"] is False)
        check("whitespace is not writing", by_day["2026-09-24"]["written"] == 1, str(by_day["2026-09-24"]))
        check("a night with no row is not closed", by_day["2026-09-22"] == {"day": "2026-09-22", "closed": False, "written": 0})


def test_looking_does_not_create_rows():
    with FreshDB() as f:
        f.engine.recent(7, today="2026-09-25")
        made = [d for d in ("2026-09-19", "2026-09-22", "2026-09-25") if f.repo.get(d) is not None]
        check("no rows created by reading", made == [], str(made))


if __name__ == "__main__":
    for fn in [v for k, v in sorted(globals().items()) if k.startswith("test_")]:
        try:
            fn()
        except Exception:
            traceback.print_exc()
            FAILURES.append(fn.__name__)
    print()
    print(f"FAILURES: {FAILURES}" if FAILURES else "ALL PASS")
    raise SystemExit(1 if FAILURES else 0)
