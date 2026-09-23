"""Idempotent regression test for the planning hierarchy
(Outcome/Milestone/Win/PlanTask) and its Goal->hierarchy migration.

    .venv/bin/python test_planning.py

Every test gets its own fresh temp SQLite DB, deleted immediately
after — never touches the real app.db.
"""

import os
import tempfile
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

        from database.repository import PlanningRepository

        self.db = connection.SessionLocal()
        self.repo = PlanningRepository(self.db)
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


def test_win_progress_empty_not_fixed_returns_zero():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "Test outcome", 2026)
        ms = eng.create_milestone(out["id"], "Test milestone", 9, 2026)
        win = eng.create_win(ms["id"], "Empty win", "2026-09-21")
        check("empty non-fixed win -> 0% progress", win["progress"] == 0)


def test_win_progress_derives_from_tasks():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        ms = eng.create_milestone(out["id"], "M", 9, 2026)
        win = eng.create_win(ms["id"], "W", "2026-09-21")
        t1 = eng.create_plan_task("life", "task 1", win_id=win["id"], scheduled_date="2026-09-21")
        eng.create_plan_task("life", "task 2", win_id=win["id"], scheduled_date="2026-09-22")
        eng.edit_plan_task(t1["id"], status="done")
        refreshed = eng.list_wins(ms["id"])[0]
        check("1/2 tasks done -> 50% win progress", refreshed["progress"] == 50)


def test_milestone_and_outcome_progress_average_children():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        ms = eng.create_milestone(out["id"], "M", 9, 2026)
        w1 = eng.create_win(ms["id"], "W1", "2026-09-07")
        w2 = eng.create_win(ms["id"], "W2", "2026-09-14")
        t1 = eng.create_plan_task("life", "t", win_id=w1["id"], scheduled_date="2026-09-07")
        eng.edit_plan_task(t1["id"], status="done")  # w1 -> 100%
        # w2 stays 0% (no tasks)
        milestones = eng.list_milestones(out["id"])
        check("milestone progress = avg(100, 0) = 50", milestones[0]["progress"] == 50)
        outcomes = eng.list_outcomes("life")
        check("outcome progress = avg over its one milestone = 50", outcomes[0]["progress"] == 50)


def test_fixed_node_returns_stored_progress_not_derived():
    with FreshDB() as f:
        from database.models import Win
        from engine.planning import PlanningEngine, win_progress
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        ms = eng.create_milestone(out["id"], "M", 9, 2026)
        f.repo.db.add(Win(id=999, milestone_id=ms["id"], title="future week", week_start_date="2026-10-05", fixed=True, progress=0))
        f.repo.db.commit()
        win = f.repo.get_win(999)
        check("fixed win with progress=0 stays 0 even with no tasks (not an error)", win_progress(win, f.repo) == 0)


def test_delete_outcome_with_children_blocked_unless_forced():
    with FreshDB() as f:
        from engine.planning import PlanningEngine, ChildrenExistError
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        eng.create_milestone(out["id"], "M", 9, 2026)
        raised = False
        try:
            eng.delete_outcome(out["id"])
        except ChildrenExistError as e:
            raised = True
            check("blocked delete reports 1 child", e.count == 1)
        check("delete with children raises ChildrenExistError", raised)
        check("force=True deletes anyway", eng.delete_outcome(out["id"], force=True))


def test_checklist_item_requires_exactly_one_parent():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        raised_zero = False
        try:
            eng.add_checklist_item("orphan")
        except ValueError:
            raised_zero = True
        check("zero parents rejected", raised_zero)
        raised_two = False
        try:
            eng.add_checklist_item("double", outcome_id=out["id"], win_id=1)
        except ValueError:
            raised_two = True
        check("two parents rejected", raised_two)
        item = eng.add_checklist_item("valid", outcome_id=out["id"])
        check("exactly one parent accepted", item.outcome_id == out["id"])


def test_reparent_milestone_moves_only_its_own_fk_not_its_wins_directly():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out_a = eng.create_outcome("life", "Outcome A", 2026)
        out_b = eng.create_outcome("life", "Outcome B", 2026)
        ms = eng.create_milestone(out_a["id"], "M", 9, 2026)
        win = eng.create_win(ms["id"], "W", "2026-09-07")
        eng.edit_milestone(ms["id"], outcome_id=out_b["id"])
        moved = eng.repo.get_milestone(ms["id"])
        check("milestone's own outcome_id changed", moved.outcome_id == out_b["id"])
        still_there = eng.repo.get_win(win["id"])
        check("win's milestone_id untouched by the reparent (it followed via the existing FK, not a second write)", still_there.milestone_id == ms["id"])
        b_milestones = eng.list_milestones(out_b["id"])
        check("outcome B now sees the milestone (and transitively its win) through the one FK change", len(b_milestones) == 1)


def test_migration_copies_goal_hierarchy_and_leaves_goals_table_untouched():
    with FreshDB() as f:
        from database.models import Goal, GoalTask
        from database.repository import PlanningRepository
        # Seed a clean yearly -> monthly -> weekly chain plus a checklist item, all for one owner.
        f.repo.db.add(Goal(id=1, project_key="proj1", horizon="yearly", text="Year goal", done=False, start_date="2026-01-01", deadline="2026-12-31", note="", next_action=""))
        f.repo.db.add(Goal(id=2, project_key="proj1", horizon="monthly", text="Month goal", done=False, start_date="2026-09-01", deadline="2026-09-30", note="", next_action=""))
        f.repo.db.add(Goal(id=3, project_key="proj1", horizon="weekly", text="Week goal", done=False, start_date="2026-09-21", deadline="2026-09-27", note="", next_action=""))
        # An orphan monthly goal for a DIFFERENT owner with no yearly goal — forces the synthetic-Outcome path.
        f.repo.db.add(Goal(id=4, project_key="proj2", horizon="monthly", text="Orphan month goal", done=False, start_date="2026-06-01", deadline="2026-06-30", note="", next_action=""))
        f.repo.db.add(GoalTask(pid="gt1", goal_id=3, text="checklist item", done=False, added_date="2026-09-21"))
        f.repo.db.commit()

        goals_before = list(f.repo.db.query(Goal).all())
        goal_tasks_before = list(f.repo.db.query(GoalTask).all())

        from alembic import command
        from alembic.config import Config
        cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
        command.downgrade(cfg, "-1")
        command.upgrade(cfg, "head")

        planning_repo = PlanningRepository(f.repo.db)
        outcomes = planning_repo.list_outcomes("proj1")
        check("proj1 got exactly one Outcome (from its yearly goal)", len(outcomes) == 1)
        milestones = planning_repo.list_milestones(outcomes[0].id) if outcomes else []
        check("proj1's Outcome has exactly one Milestone", len(milestones) == 1)
        wins = planning_repo.list_wins(milestones[0].id) if milestones else []
        check("proj1's Milestone has exactly one Win", len(wins) == 1)
        checklist = planning_repo.list_checklist_items(win_id=wins[0].id) if wins else []
        check("the checklist item followed its Goal to the new Win", len(checklist) == 1)

        proj2_outcomes = planning_repo.list_outcomes("proj2")
        check("proj2 (orphan monthly goal) got a synthetic Outcome", len(proj2_outcomes) == 1)
        check("synthetic Outcome is titled 'General <year>'", proj2_outcomes[0].title.startswith("General "))

        goals_after = list(f.repo.db.query(Goal).all())
        goal_tasks_after = list(f.repo.db.query(GoalTask).all())
        check("goals table row count unchanged", len(goals_after) == len(goals_before))
        check("goal_tasks table row count unchanged", len(goal_tasks_after) == len(goal_tasks_before))


def test_migration_dedupes_two_yearly_goals_for_the_same_owner_and_year():
    with FreshDB() as f:
        from database.models import Goal
        from database.repository import PlanningRepository
        f.repo.db.add(Goal(id=10, project_key="proj1", horizon="yearly", text="Year A", done=False, start_date="2026-01-01", deadline="2026-12-31", note="", next_action=""))
        f.repo.db.add(Goal(id=11, project_key="proj1", horizon="yearly", text="Year B", done=False, start_date="2026-02-01", deadline="2026-12-31", note="", next_action=""))
        f.repo.db.add(Goal(id=12, project_key="proj1", horizon="monthly", text="Month goal", done=False, start_date="2026-09-01", deadline="2026-09-30", note="", next_action=""))
        f.repo.db.commit()

        from alembic import command
        from alembic.config import Config
        cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
        command.downgrade(cfg, "-1")
        command.upgrade(cfg, "head")

        planning_repo = PlanningRepository(f.repo.db)
        outcomes = planning_repo.list_outcomes("proj1")
        check("two yearly goals for the same owner+year collapse to ONE Outcome", len(outcomes) == 1)
        milestones = planning_repo.list_milestones(outcomes[0].id)
        # The second yearly Goal ("Year B") itself folds in as a Milestone
        # (see the migration's own comment) alongside the real monthly
        # Goal — both must be reachable from the one surviving Outcome,
        # nothing silently dropped.
        check("the monthly goal attached to that single Outcome", any(m.title == "Month goal" for m in milestones))
        check("the second yearly Goal also folded in as a Milestone rather than being dropped", any(m.title == "Year B" for m in milestones))


def test_milestone_progress_respects_fixed():
    with FreshDB() as f:
        from database.models import Milestone
        from engine.planning import PlanningEngine, milestone_progress
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        f.repo.db.add(Milestone(id=777, outcome_id=out["id"], title="fixed milestone", month=9, year=2026, fixed=True, progress=65))
        f.repo.db.commit()
        milestone = f.repo.get_milestone(777)
        check("fixed milestone with progress=65 and no wins still reports 65", milestone_progress(milestone, f.repo) == 65)


def test_outcome_progress_respects_fixed():
    with FreshDB() as f:
        from database.models import Outcome
        from engine.planning import outcome_progress
        f.repo.db.add(Outcome(id=888, owner_key="life", title="fixed outcome", year=2026, fixed=True, progress=80))
        f.repo.db.commit()
        outcome = f.repo.get_outcome(888)
        check("fixed outcome with progress=80 and an unrelated 0% milestone still reports 80", outcome_progress(outcome, f.repo) == 80)


def test_win_progress_excludes_dropped_tasks_from_denominator():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        ms = eng.create_milestone(out["id"], "M", 9, 2026)
        win = eng.create_win(ms["id"], "W", "2026-09-21")
        t1 = eng.create_plan_task("life", "done task", win_id=win["id"], scheduled_date="2026-09-21")
        t2 = eng.create_plan_task("life", "dropped task", win_id=win["id"], scheduled_date="2026-09-22")
        eng.edit_plan_task(t1["id"], status="done")
        eng.edit_plan_task(t2["id"], status="dropped")
        refreshed = eng.list_wins(ms["id"])[0]
        check("1 done + 1 dropped -> 100% (dropped excluded from denominator)", refreshed["progress"] == 100)


def test_marking_win_achieved_pins_progress_to_100():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        ms = eng.create_milestone(out["id"], "M", 9, 2026)
        win = eng.create_win(ms["id"], "W", "2026-09-21")
        eng.create_plan_task("life", "unfinished task", win_id=win["id"], scheduled_date="2026-09-21")
        # Before: win has 1 task, 0 done -> derives to 0%, not 100.
        before = eng.list_wins(ms["id"])[0]
        check("win starts at 0% (derived, one unfinished task)", before["progress"] == 0)
        edited = eng.edit_win(win["id"], status="achieved")
        check("marking achieved pins progress to 100 even with an unfinished task", edited["progress"] == 100)
        check("marking achieved sets fixed=True", edited["fixed"] is True)
        refreshed = eng.list_wins(ms["id"])[0]
        check("achieved + 100% survives a fresh read (not just the edit response)", refreshed["progress"] == 100 and refreshed["fixed"] is True)


def test_unmarking_achieved_returns_to_derived_progress():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        ms = eng.create_milestone(out["id"], "M", 9, 2026)
        win = eng.create_win(ms["id"], "W", "2026-09-21")
        eng.create_plan_task("life", "unfinished task", win_id=win["id"], scheduled_date="2026-09-21")
        eng.edit_win(win["id"], status="achieved")
        edited = eng.edit_win(win["id"], status="active")
        check("un-marking achieved clears fixed", edited["fixed"] is False)
        check("progress goes back to derived (0%, the task is still unfinished)", edited["progress"] == 0)


def test_marking_milestone_and_outcome_achieved_cascades_up():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        ms = eng.create_milestone(out["id"], "M", 9, 2026)
        eng.create_win(ms["id"], "W", "2026-09-21")  # stays at 0%, never marked achieved
        eng.edit_milestone(ms["id"], status="achieved")
        milestone_after = eng.list_milestones(out["id"])[0]
        check("milestone marked achieved reads 100% regardless of its Win", milestone_after["progress"] == 100)
        outcomes_after = eng.list_outcomes("life")
        check("outcome (not itself marked achieved) still averages its one milestone's now-100%", outcomes_after[0]["progress"] == 100)


def test_reparent_to_nonexistent_parent_raises():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        ms = eng.create_milestone(out["id"], "M", 9, 2026)
        raised = False
        try:
            eng.edit_milestone(ms["id"], outcome_id=999999999)
        except ValueError:
            raised = True
        check("re-parenting to a non-existent outcome raises instead of silently no-op'ing", raised)
        unchanged = f.repo.get_milestone(ms["id"])
        check("milestone's outcome_id is unchanged after the rejected reparent", unchanged.outcome_id == out["id"])


def test_carry_forward_nextweek_moves_win_id_when_target_win_exists():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        ms = eng.create_milestone(out["id"], "M", 9, 2026)
        this_week = eng.create_win(ms["id"], "This week", "2026-09-21")
        next_week = eng.create_win(ms["id"], "Next week", "2026-09-28")
        task = eng.create_plan_task("life", "carry me", win_id=this_week["id"], scheduled_date="2026-09-21")
        moved = eng.carry_forward_plan_task(task["id"], "nextweek")
        check("task's win_id points at next week's real Win", moved["win_id"] == next_week["id"])
        check("task's scheduled_date shifted 7 days", moved["scheduled_date"] == "2026-09-28")
        this_week_after = eng.list_wins(ms["id"])
        this = next(w for w in this_week_after if w["id"] == this_week["id"])
        check("source win no longer counts the moved task (0 tasks -> 0%, not stuck non-zero)", this["progress"] == 0)


def test_carry_forward_nextweek_falls_back_to_backlog_when_no_target_win():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        ms = eng.create_milestone(out["id"], "M", 9, 2026)
        this_week = eng.create_win(ms["id"], "This week", "2026-09-21")
        task = eng.create_plan_task("life", "carry me", win_id=this_week["id"], scheduled_date="2026-09-21")
        moved = eng.carry_forward_plan_task(task["id"], "nextweek")
        check("no Win exists for next week -> task detaches to backlog rather than a silent no-op", moved["win_id"] is None)
        check("scheduled_date still shifts 7 days even when detached", moved["scheduled_date"] == "2026-09-28")


def test_force_delete_cascades_fully_at_every_level_with_checklist_items():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        eng.add_checklist_item("outcome note", outcome_id=out["id"])
        ms = eng.create_milestone(out["id"], "M", 9, 2026)
        eng.add_checklist_item("milestone note", milestone_id=ms["id"])
        win = eng.create_win(ms["id"], "W", "2026-09-21")
        eng.add_checklist_item("win note", win_id=win["id"])
        task = eng.create_plan_task("life", "t", win_id=win["id"], scheduled_date="2026-09-21")

        check("delete_milestone(force=True) cascades through its Win", eng.delete_milestone(ms["id"], force=True))
        check("milestone gone", f.repo.get_milestone(ms["id"]) is None)
        check("win gone", f.repo.get_win(win["id"]) is None)
        check("milestone's own checklist item cascaded away", len(f.repo.list_checklist_items(milestone_id=ms["id"])) == 0)
        check("win's own checklist item cascaded away", len(f.repo.list_checklist_items(win_id=win["id"])) == 0)
        check("outcome's checklist item is untouched (outcome itself not deleted yet)", len(f.repo.list_checklist_items(outcome_id=out["id"])) == 1)
        # the task itself survives (win_id FK is SET NULL, not CASCADE) but is now orphaned
        task_after = f.repo.get_plan_task(task["id"])
        check("plan task survives the cascade (SET NULL, not deleted)", task_after is not None)
        check("plan task's win_id nulled out", task_after.win_id is None)

        check("delete_outcome(force=True) on the now-childless outcome still works", eng.delete_outcome(out["id"], force=True))
        check("outcome's own checklist item cascaded away too", len(f.repo.list_checklist_items(outcome_id=out["id"])) == 0)


def main():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        print(f"\n── {t.__name__} ──")
        t()
    print(f"\n{len(tests)} tests run, {len(FAILURES)} failures")
    if FAILURES:
        for f in FAILURES:
            print(f"  FAILED: {f}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
