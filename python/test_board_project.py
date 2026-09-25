"""The board on the project card (migration d8f0b2c4e6a7, engine/board.py).

    python python/test_board_project.py

What matters: tasks already on a goal's board survive the migration,
cards and all, and are found on their project's board; a task added from
the project card needs no goal; and the board's routes no longer sit on
the goal checklist's path.
"""

import os
import sqlite3
import tempfile
import traceback

from alembic import command
from alembic.config import Config

FAILURES = []
INI = os.path.join(os.path.dirname(__file__), "alembic.ini")


def check(label, cond, detail=""):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(label)


def test_migration_keeps_existing_boards():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["APP_DB_PATH"] = path
    command.upgrade(Config(INI), "c7e9a1b3d5f6")
    con = sqlite3.connect(path)
    con.execute(
        "INSERT INTO goals (id, project_key, horizon, text, done, start_date, note, next_action, deadline) "
        "VALUES (1, 'proj2', 'weekly', 'Old goal', 0, '2026-09-01', '', '', '2026-12-01')"
    )
    con.execute("INSERT INTO board_tasks (id, goal_id, title, outcome, next_action, sort_order) VALUES (10, 1, 'Old task', '', '', 0)")
    con.execute(
        "INSERT INTO board_cards (id, task_id, col, title, note, priority, pinned, secs, sessions, sort_order) "
        "VALUES (100, 10, 'focus', 'Old card', '', 'normal', 0, 0, '[]', 0)"
    )
    con.commit()
    con.close()

    command.upgrade(Config(INI), "head")
    con = sqlite3.connect(path)
    row = con.execute("SELECT goal_id, project_key FROM board_tasks WHERE id = 10").fetchone()
    check("existing task keeps its goal", row and row[0] == 1, str(row))
    check("existing task gets its goal's project", row and row[1] == "proj2", str(row))
    cards = con.execute("SELECT COUNT(*) FROM board_cards WHERE task_id = 10").fetchone()[0]
    check("its cards survive the table rebuild", cards == 1, f"{cards} cards")
    con.close()

    import importlib
    import database.connection as connection
    importlib.reload(connection)
    from database.repository import BoardTaskRepository
    from engine.board import BoardTaskEngine

    db = connection.SessionLocal()
    eng = BoardTaskEngine(BoardTaskRepository(db))
    new = eng.add_project_task("proj2", "  New task  ")
    check("a project task needs no goal", new["goal_id"] is None and new["project_key"] == "proj2", str(new))
    check("title is trimmed", new["title"] == "New task")
    titles = [t["title"] for t in eng.tasks_for_project("proj2")]
    check("project board shows old and new tasks", titles == ["Old task", "New task"], str(titles))
    check("other projects' boards stay separate", eng.tasks_for_project("proj3") == [])
    try:
        eng.add_project_task("proj2", "   ")
        check("empty title is refused", False)
    except ValueError:
        check("empty title is refused", True)
    db.close()


def test_routes_do_not_clash():
    # Every router the server mounts, read one by one: FastAPI answers a
    # clash with whichever was included first and says nothing, which is
    # how the board's task routes went unreachable behind goals.py's.
    import importlib
    import pkgutil

    import api.routes
    from fastapi import APIRouter

    seen = {}
    for mod in pkgutil.iter_modules(api.routes.__path__):
        m = importlib.import_module(f"api.routes.{mod.name}")
        for obj in vars(m).values():
            if isinstance(obj, APIRouter):
                for r in obj.routes:
                    for meth in getattr(r, "methods", None) or []:
                        seen.setdefault((meth, r.path), set()).add(f"{mod.name}.{r.name}")
    dupes = {k: v for k, v in seen.items() if len(v) > 1}
    check("no two routes share a method and path", not dupes, str(dupes))
    check("board list is on the project", ("GET", "/api/projects/{key}/board-tasks") in seen)


if __name__ == "__main__":
    for t in (test_migration_keeps_existing_boards, test_routes_do_not_clash):
        try:
            t()
        except Exception:
            traceback.print_exc()
            FAILURES.append(t.__name__)
    print(f"\n{'ALL PASS' if not FAILURES else f'{len(FAILURES)} FAILED: {FAILURES}'}")
    raise SystemExit(1 if FAILURES else 0)
