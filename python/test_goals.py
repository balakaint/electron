"""Regression test for the "life" virtual project-owner (the redesigned
Life Plan feature — see database/models.py's Goal.project_key comment and
migration 26f6de8766a5). No pytest dependency:

    .venv/bin/python test_goals.py

Every test gets its own fresh temp SQLite DB, deleted immediately after
— never touches the real app.db.
"""

import os
import tempfile
import traceback

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

        from alembic import command
        from alembic.config import Config

        cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
        command.upgrade(cfg, "head")

        from database.repository import GoalRepository, ProjectRepository

        self.db = connection.SessionLocal()
        self.goal_repo = GoalRepository(self.db)
        self.project_repo = ProjectRepository(self.db)
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


def test_life_goal_creates_without_a_project_row():
    with FreshDB() as f:
        from engine.goals import GoalEngine

        engine = GoalEngine(f.goal_repo)
        goal = engine.create_goal("life", "weekly", "Be present with my family")
        check("goal created under project_key='life'", goal["project_key"] == "life")
        check("no 'life' row was created in projects", f.project_repo.get("life") is None)


def test_life_goals_isolated_from_a_real_projects_goals():
    with FreshDB() as f:
        from engine.goals import GoalEngine

        engine = GoalEngine(f.goal_repo)
        engine.create_goal("life", "weekly", "Life weekly goal")
        engine.create_goal("proj1", "weekly", "Proj1 weekly goal")

        life_goals = engine.list_goals("life")
        proj1_goals = engine.list_goals("proj1")
        check("life list has exactly the life goal", [g["text"] for g in life_goals] == ["Life weekly goal"])
        check("proj1 list has exactly the proj1 goal", [g["text"] for g in proj1_goals] == ["Proj1 weekly goal"])


def test_life_never_pollutes_the_real_project_roster():
    """Panel 1 shows a fixed 6-slot roster from ProjectRepository.list()
    / project_order() — "life" must never appear there, which is exactly
    why it's a reserved goal-owner key rather than a real Project row."""
    with FreshDB() as f:
        from engine.goals import GoalEngine
        from engine.projects import ProjectEngine

        GoalEngine(f.goal_repo).create_goal("life", "monthly", "Some life goal")

        project_engine = ProjectEngine(f.project_repo)
        order = project_engine.project_order()
        check("project_order has exactly the 6 real projects", len(order) == 6)
        check("no entry in project_order is keyed 'life'", all(e["project"]["key"] != "life" for e in order))


def test_life_goal_full_crud_same_as_a_real_project_goal():
    with FreshDB() as f:
        from engine.goals import GoalEngine

        engine = GoalEngine(f.goal_repo)
        goal = engine.create_goal("life", "yearly", "Original text")
        goal_id = goal["id"]

        edited = engine.edit_goal(goal_id, text="Edited text", note="a note")
        check("edit works on a life goal", edited["text"] == "Edited text" and edited["note"] == "a note")

        toggled = engine.toggle_goal(goal_id)
        check("toggle works on a life goal", toggled["done"] is True and toggled["done_date"] is not None)

        check("delete works on a life goal", engine.delete_goal(goal_id) is True)
        check("deleted life goal no longer listed", engine.list_goals("life") == [])


def test_goal_panel_no_longer_carries_life_plan_headline():
    """The old standalone headline field was removed from the panel
    output as part of the redesign — the AppState column itself stays
    (unused), same never-drop-a-superseded-column convention as
    everywhere else in this app, but the API surface for it is gone."""
    with FreshDB() as f:
        from database.repository import TaskRepository
        from engine.goals import get_goal_panel

        task_repo = TaskRepository(f.db)
        panel = get_goal_panel(task_repo)
        check("life_plan_headline is not in the panel output", "life_plan_headline" not in panel)


def run_all():
    tests = [
        test_life_goal_creates_without_a_project_row,
        test_life_goals_isolated_from_a_real_projects_goals,
        test_life_never_pollutes_the_real_project_roster,
        test_life_goal_full_crud_same_as_a_real_project_goal,
        test_goal_panel_no_longer_carries_life_plan_headline,
    ]
    for t in tests:
        try:
            t()
        except Exception:
            FAILURES.append(t.__name__)
            print(f"[FAIL] {t.__name__} raised:")
            traceback.print_exc()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILURE(S): {FAILURES}")
    else:
        print("ALL PASS")
    return len(FAILURES) == 0


if __name__ == "__main__":
    ok = run_all()
    raise SystemExit(0 if ok else 1)
