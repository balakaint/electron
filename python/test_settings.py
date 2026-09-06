"""Idempotent regression test for the settings foundation (theme,
onboarded flag, task-restore-for-undo). No pytest dependency:

    .venv/bin/python test_settings.py

Every test gets its own fresh temp SQLite DB, deleted immediately after
— never touches the real app.db.
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

        from database.repository import ProjectRepository, TaskRepository
        from engine.tasks import TaskEngine

        self.db = connection.SessionLocal()
        self.repo = TaskRepository(self.db)
        self.engine = TaskEngine(self.repo, ProjectRepository(self.db))
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


def test_default_settings():
    with FreshDB() as f:
        from engine.settings import get_settings
        s = get_settings(f.repo)
        check("default theme is 'focus'", s["theme"] == "focus")
        check("default onboarded is False", s["onboarded"] is False)


def test_set_theme():
    with FreshDB() as f:
        from engine.settings import get_settings, set_theme
        s = set_theme(f.repo, "warroom")
        f.db.commit()
        check("set_theme returns the new theme", s["theme"] == "warroom")
        reloaded = get_settings(f.repo)
        check("theme persists across a fresh read", reloaded["theme"] == "warroom")


def test_invalid_theme_rejected():
    with FreshDB() as f:
        from engine.settings import set_theme
        try:
            set_theme(f.repo, "not-a-real-theme")
            raised = False
        except ValueError:
            raised = True
        check("setting an invalid theme raises ValueError", raised)


def test_set_onboarded():
    with FreshDB() as f:
        from engine.settings import get_settings, set_onboarded
        s = set_onboarded(f.repo, True)
        f.db.commit()
        check("set_onboarded(True) sticks", s["onboarded"] is True)
        check("onboarded persists across a fresh read", get_settings(f.repo)["onboarded"] is True)


def test_default_new_settings():
    with FreshDB() as f:
        from engine.settings import get_settings
        s = get_settings(f.repo)
        check("default lang is 'en'", s["lang"] == "en")
        check("default analog_clock is False", s["analog_clock"] is False)
        check("default auto_timer_on_open is True", s["auto_timer_on_open"] is True)
        check("default idle_stop_min is 15", s["idle_stop_min"] == 15)
        check("default phase hours match legacy", (
            s["phase_morning_start"], s["phase_work_start"],
            s["phase_evening_start"], s["phase_sleep_start"],
        ) == (5, 9, 18, 23))
        check("default goal_hours is 5", s["goal_hours"] == 5)
        check("default currency is '$'", s["currency"] == "$")
        check("default start_with_windows is False", s["start_with_windows"] is False)


def test_update_settings_partial():
    with FreshDB() as f:
        from engine.settings import get_settings, update_settings
        s = update_settings(f.repo, idle_stop_min=30, currency="৳")
        f.db.commit()
        check("idle_stop_min updated", s["idle_stop_min"] == 30)
        check("currency updated", s["currency"] == "৳")
        check("unrelated field (lang) left untouched", s["lang"] == "en")
        reloaded = get_settings(f.repo)
        check("both changes persist across a fresh read",
              reloaded["idle_stop_min"] == 30 and reloaded["currency"] == "৳")


def test_update_settings_clamps():
    with FreshDB() as f:
        from engine.settings import update_settings
        s = update_settings(f.repo, idle_stop_min=999, phase_work_start=-5, goal_hours=0)
        check("idle_stop_min clamped to max 120", s["idle_stop_min"] == 120)
        check("phase_work_start clamped to min 0", s["phase_work_start"] == 0)
        check("goal_hours clamped to min 1", s["goal_hours"] == 1)


def test_update_settings_blank_currency_falls_back():
    with FreshDB() as f:
        from engine.settings import update_settings
        s = update_settings(f.repo, currency="   ")
        check("blank currency falls back to '$'", s["currency"] == "$")


def test_invalid_lang_rejected():
    with FreshDB() as f:
        from engine.settings import update_settings
        try:
            update_settings(f.repo, lang="fr")
            raised = False
        except ValueError:
            raised = True
        check("setting an unsupported lang raises ValueError", raised)


def test_idle_stop_setting_changes_real_timer_behavior():
    """End-to-end: lowering idle_stop_min in Settings must actually
    change how much time a stale timer gets credited — not just be a
    number that round-trips through the API with no effect."""
    with FreshDB() as f:
        import time as _time
        from engine.settings import update_settings
        from engine.timer_reconciliation import stop_project

        update_settings(f.repo, idle_stop_min=5)  # 5 min instead of the 15 min default
        f.db.commit()

        from database.repository import ProjectRepository
        project_repo = ProjectRepository(f.db)
        project = project_repo.get("proj1")
        project.running_since = _time.time() - 3600  # stale by an hour
        project_repo.save(project)

        stop_project(project_repo, project)  # idle_limit_secs not passed -> self-resolves from settings
        activity = project_repo.get_activity("proj1", str(date.today()))
        check(
            "stop_project self-resolves the configured 5-minute idle limit, not the 15-minute default",
            activity is not None and abs(activity.secs - 5 * 60) < 2,
            f"got {activity.secs if activity else None}s, expected ~300s",
        )


def test_restore_task_undoes_delete():
    with FreshDB() as f:
        t = f.engine.create_task("undo me", "classic")
        f.db.commit()
        snapshot = {
            "id": t.id, "list_key": t.list_key, "text": t.text, "done": t.done,
            "secs": t.secs, "sessions": t.sessions, "est": t.est, "mit": t.mit,
            "day": t.day, "urgency": t.urgency, "strike": t.strike,
            "project": t.project, "psrc": t.psrc,
        }
        f.engine.delete_task(t.id)
        f.db.commit()
        check("task is gone after delete", f.engine.get_task(t.id) is None)

        restored = f.engine.restore_task(snapshot)
        f.db.commit()
        check("restore_task brings it back", restored is not None and restored.id == t.id)
        check("restored text matches", restored.text == "undo me")

        again = f.engine.restore_task(snapshot)
        check("restoring an id that already exists is a no-op (returns None)", again is None)


def run_all():
    tests = [
        test_default_settings,
        test_set_theme,
        test_invalid_theme_rejected,
        test_set_onboarded,
        test_default_new_settings,
        test_update_settings_partial,
        test_update_settings_clamps,
        test_update_settings_blank_currency_falls_back,
        test_invalid_lang_rejected,
        test_idle_stop_setting_changes_real_timer_behavior,
        test_restore_task_undoes_delete,
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
