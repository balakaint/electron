"""Idempotent regression test for the Deep Work Trend chart's data
source (deep_work_trend/week_summary/goal_secs on ProjectEngine) and
the capacity insight (capacity_insight on TaskEngine). No pytest
dependency — plain asserts, run directly:

    .venv/bin/python test_deep_work_trend.py

Every test gets its own fresh temp SQLite DB, deleted immediately after
— never touches the real app.db.
"""

import os
import tempfile
import time
import traceback
from datetime import date, timedelta

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

        from database.repository import ProjectRepository, TaskRepository
        from engine.projects import ProjectEngine
        from engine.tasks import TaskEngine

        self.db = connection.SessionLocal()
        self.project_repo = ProjectRepository(self.db)
        self.task_repo = TaskRepository(self.db)
        self.projects = ProjectEngine(self.project_repo)
        self.tasks = TaskEngine(self.task_repo, self.project_repo)
        # A fresh install seeds all six slots with example names
        # (f927859). These tests are about what counts once a project IS
        # named, so start every slot unnamed and let each test name the
        # ones it needs.
        for project in self.project_repo.list():
            project.name = ""
            self.project_repo.save(project)
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)

    def name_project(self, key: str, name: str, target_minutes: int = 60):
        project = self.project_repo.get(key)
        project.name = name
        project.target_minutes = target_minutes
        self.project_repo.save(project)

    def seed_activity(self, key: str, day: str, secs: float):
        row = self.project_repo.get_or_create_activity(key, day)
        row.secs = secs
        self.project_repo.save_activity(row)


TODAY = date.today()


def d(days_ago: int) -> str:
    return str(TODAY - timedelta(days=days_ago))


def test_goal_secs_from_named_projects_or_settings():
    with FreshDB() as f:
        default_goal = f.project_repo.get_app_state().goal_hours * 3600
        check("no named projects falls back to settings goal_hours", f.projects.goal_secs() == default_goal)

        f.name_project("proj1", "Book", target_minutes=90)
        check("a named project's own target becomes the goal", f.projects.goal_secs() == 90 * 60)

        f.name_project("proj2", "App", target_minutes=30)
        check("multiple named projects sum their targets", f.projects.goal_secs() == (90 + 30) * 60)


def test_deep_work_trend_sums_named_projects_only():
    with FreshDB() as f:
        f.name_project("proj1", "Book")
        f.seed_activity("proj1", d(0), 3600)
        f.seed_activity("proj2", d(0), 9999)  # proj2 never named — must not count
        trend = f.projects.deep_work_trend(30)
        check("today's total counts only named projects", trend["secs"][-1] == 3600)
        check("trend returns the requested window length when no clip applies", len(trend["days"]) <= 30)


def test_deep_work_trend_clips_to_earliest_activity():
    with FreshDB() as f:
        f.name_project("proj1", "Book")
        f.seed_activity("proj1", d(3), 1800)
        f.seed_activity("proj1", d(1), 3600)
        trend = f.projects.deep_work_trend(30)
        check(
            "days before the earliest real activity are dropped, not shown as zero",
            trend["days"][0] == d(3),
        )
        check("clipped window still runs through today", trend["days"][-1] == d(0))


def test_deep_work_trend_days_snap_to_30_or_90():
    with FreshDB() as f:
        trend = f.projects.deep_work_trend(45)
        check("an unsupported window snaps to 90", len(trend["days"]) == 90)


def test_trend_days_setting_persists():
    with FreshDB() as f:
        check("default trend_days is 30", f.projects.get_trend_days() == 30)
        f.projects.set_trend_days(90)
        check("set_trend_days persists", f.projects.get_trend_days() == 90)
        raised = False
        try:
            f.projects.set_trend_days(45)
        except ValueError:
            raised = True
        check("an invalid trend_days value raises", raised)


def test_week_summary_no_data():
    with FreshDB() as f:
        summary = f.projects.week_summary()
        check("no activity this week reports has_data False", summary["has_data"] is False)


def test_week_summary_with_data():
    with FreshDB() as f:
        f.name_project("proj1", "Book", target_minutes=60)
        f.seed_activity("proj1", d(0), 3600)  # hits the 60-min goal today
        f.seed_activity("proj1", d(2), 1800)  # under goal
        summary = f.projects.week_summary()
        check("has_data is True once something is logged", summary["has_data"] is True)
        check("hit_days counts only days meeting the goal", summary["hit_days"] == 1)
        check("best_day is the day with the most seconds", summary["best_day"] == d(0))
        check("total_secs sums the whole week", summary["total_secs"] == 3600 + 1800)


def test_deep_streak():
    with FreshDB() as f:
        check("no activity means no streak", f.projects.deep_streak() == 0)

        f.name_project("proj1", "Book", target_minutes=60)
        f.seed_activity("proj1", d(0), 3600)
        f.seed_activity("proj1", d(1), 3600)
        f.seed_activity("proj1", d(2), 3600)
        f.seed_activity("proj1", d(3), 1800)  # breaks the streak (under goal)
        check("streak counts consecutive goal-hitting days ending today", f.projects.deep_streak() == 3)

        f.seed_activity("proj1", d(0), 1800)  # today not yet finished
        check(
            "an unfinished today doesn't break the streak, just isn't counted in it",
            f.projects.deep_streak() == 2,
        )


def test_capacity_insight_needs_minimum_data():
    with FreshDB() as f:
        check("no sessions at all returns None", f.tasks.capacity_insight() is None)

        t = f.tasks.create_task("short task", "classic")
        task = f.task_repo.get(t.id)
        task.sessions = [{"start": time.time() - 60, "end": time.time()}]
        f.task_repo.save(task)
        check("under an hour of total logged time returns None", f.tasks.capacity_insight() is None)


def test_capacity_insight_detects_dominant_hour():
    with FreshDB() as f:
        t = f.tasks.create_task("deep work session", "classic")
        task = f.task_repo.get(t.id)
        # Three 40-minute sessions, all starting at 9am on different days —
        # well past the 25% dominance threshold and the 1h minimum sample.
        nine_am_today = time.mktime(date.today().timetuple()) + 9 * 3600
        task.sessions = [
            {"start": nine_am_today - i * 86400, "end": nine_am_today - i * 86400 + 2400} for i in range(3)
        ]
        f.task_repo.save(task)
        insight = f.tasks.capacity_insight()
        check("a clearly dominant hour produces an insight", insight is not None)
        check("the insight names 9 AM", insight is not None and "9 AM" in insight)


def test_note_title_is_separate_from_the_note():
    """Legacy's per-project Quick Notes HEADING (_qn_title_<key>).

    It is its own field, not the note body: legacy preserves renamed
    headings explicitly on save (580-587), and the port had no column at
    all — so every card showed the fixed "QUICK NOTES" and any rename in
    an imported file was dropped.
    """
    with FreshDB() as f:
        p = f.projects.update_project("proj1", note="body text")
        check("a project starts with no custom heading", p.note_title == "", repr(p.note_title))

        p = f.projects.update_project("proj1", note_title="WHAT TO DO IN SEPTEMBER")
        check("the heading is stored", p.note_title == "WHAT TO DO IN SEPTEMBER")
        check("and it did not touch the note body", p.note == "body text", repr(p.note))

        p = f.projects.update_project("proj1", note="new body")
        check("editing the note leaves the heading alone",
              p.note_title == "WHAT TO DO IN SEPTEMBER", repr(p.note_title))

        # Empty means "use the default heading", so it must be storable.
        p = f.projects.update_project("proj1", note_title="")
        check("clearing the heading is allowed", p.note_title == "")

        check("note_title is exposed to the client",
              "note_title" in f.projects.project_to_dict(f.project_repo.get("proj1")))


def run_all():
    tests = [
        test_goal_secs_from_named_projects_or_settings,
        test_deep_work_trend_sums_named_projects_only,
        test_deep_work_trend_clips_to_earliest_activity,
        test_deep_work_trend_days_snap_to_30_or_90,
        test_trend_days_setting_persists,
        test_week_summary_no_data,
        test_week_summary_with_data,
        test_deep_streak,
        test_capacity_insight_needs_minimum_data,
        test_capacity_insight_detects_dominant_hour,
        test_note_title_is_separate_from_the_note,
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
        raise SystemExit(1)
    print("ALL PASS")


if __name__ == "__main__":
    run_all()
