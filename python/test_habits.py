"""Idempotent regression test for the daily Do's/Don'ts habit list. No
pytest dependency:

    .venv/bin/python test_habits.py

Every test gets its own fresh temp SQLite DB, deleted immediately after
— never touches the real app.db.
"""

import os
import tempfile
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

        from database.repository import HabitRepository

        self.db = connection.SessionLocal()
        self.repo = HabitRepository(self.db)
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


def test_empty_list():
    with FreshDB() as f:
        import engine.habits as h
        check("fresh DB has no habit items", h.list_habits(f.repo) == [])


def test_create_validates_kind_and_priority():
    with FreshDB() as f:
        import engine.habits as h
        try:
            h.create_habit(f.repo, "maybe", "x")
            raised = False
        except ValueError:
            raised = True
        check("invalid kind raises ValueError", raised)

        try:
            h.create_habit(f.repo, "do", "x", priority="urgent")
            raised = False
        except ValueError:
            raised = True
        check("invalid priority raises ValueError", raised)

        try:
            h.create_habit(f.repo, "do", "   ")
            raised = False
        except ValueError:
            raised = True
        check("blank name raises ValueError", raised)


def test_streak_empty_history():
    with FreshDB() as f:
        import engine.habits as h
        r = h.create_habit(f.repo, "do", "Wake up early")
        check("new item has 0 streak", r[0]["streak"] == 0)
        check("new item is not done today", r[0]["done_today"] is False)


def test_streak_single_day():
    with FreshDB() as f:
        import engine.habits as h
        r = h.create_habit(f.repo, "do", "Wake up early")
        item_id = r[0]["id"]
        today = str(date.today())
        r = h.checkin(f.repo, item_id, today, True)
        check("checking today in -> streak 1", r[0]["streak"] == 1)
        check("checking today in -> done_today true", r[0]["done_today"] is True)


def test_streak_consecutive_days():
    with FreshDB() as f:
        import engine.habits as h
        r = h.create_habit(f.repo, "do", "Wake up early")
        item_id = r[0]["id"]
        today = date.today()
        for delta in range(4, -1, -1):  # 4 days ago .. today, 5 in a row
            h.checkin(f.repo, item_id, str(today - timedelta(days=delta)), True)
        r = h.list_habits(f.repo)
        check("5 consecutive days -> streak 5", r[0]["streak"] == 5)


def test_streak_breaks_at_gap():
    with FreshDB() as f:
        import engine.habits as h
        r = h.create_habit(f.repo, "do", "Wake up early")
        item_id = r[0]["id"]
        today = date.today()
        h.checkin(f.repo, item_id, str(today), True)
        h.checkin(f.repo, item_id, str(today - timedelta(days=1)), True)
        # day -2 left unset (a gap) — day -3 done shouldn't count
        h.checkin(f.repo, item_id, str(today - timedelta(days=3)), True)
        r = h.list_habits(f.repo)
        check("gap breaks the streak at 2, ignoring the older done day", r[0]["streak"] == 2)


def test_streak_breaks_at_explicit_false():
    with FreshDB() as f:
        import engine.habits as h
        r = h.create_habit(f.repo, "do", "Wake up early")
        item_id = r[0]["id"]
        today = date.today()
        h.checkin(f.repo, item_id, str(today), True)
        h.checkin(f.repo, item_id, str(today - timedelta(days=1)), False)
        h.checkin(f.repo, item_id, str(today - timedelta(days=2)), True)
        r = h.list_habits(f.repo)
        check("an explicit False breaks the streak same as a gap", r[0]["streak"] == 1)


def test_streak_spans_month_boundary():
    with FreshDB() as f:
        import engine.habits as h
        r = h.create_habit(f.repo, "do", "Wake up early")
        item_id = r[0]["id"]
        # 2026-10-02, 10-01, 09-30, 09-29 — crosses a month boundary
        anchor = date(2026, 10, 2)
        for delta in range(3, -1, -1):
            h.checkin(f.repo, item_id, str(anchor - timedelta(days=delta)), True)
        r = h.checkin(f.repo, item_id, str(anchor), True)  # re-fetch via checkin's own return
        streak_val = h.streak(f.repo.get(item_id), str(anchor))
        check("streak walks backward correctly across a month boundary", streak_val == 4)


def test_checkin_is_idempotent():
    with FreshDB() as f:
        import engine.habits as h
        r = h.create_habit(f.repo, "do", "Wake up early")
        item_id = r[0]["id"]
        today = str(date.today())
        h.checkin(f.repo, item_id, today, True)
        h.checkin(f.repo, item_id, today, True)
        item = f.repo.get(item_id)
        check("checking the same day twice doesn't duplicate the history entry", len(item.history) == 1)


def test_edit_updates_only_given_fields():
    with FreshDB() as f:
        import engine.habits as h
        r = h.create_habit(f.repo, "dont", "Smoking", time="", priority="high", tracking_basis="zero cigarettes")
        item_id = r[0]["id"]
        r = h.edit_habit(f.repo, item_id, tracking_basis="no cigarettes, all day")
        item = next(i for i in r if i["id"] == item_id)
        check("edited field changed", item["tracking_basis"] == "no cigarettes, all day")
        check("untouched field unchanged", item["name"] == "Smoking")
        check("untouched field unchanged", item["priority"] == "high")


def test_delete_removes_item():
    with FreshDB() as f:
        import engine.habits as h
        r = h.create_habit(f.repo, "do", "Wake up early")
        item_id = r[0]["id"]
        r = h.delete_habit(f.repo, item_id)
        check("deleted item is gone from the list", r == [])
        check("deleted item is gone from the repo", f.repo.get(item_id) is None)


def test_reorder_sets_sort_order():
    with FreshDB() as f:
        import engine.habits as h
        r1 = h.create_habit(f.repo, "do", "A")
        r2 = h.create_habit(f.repo, "do", "B")
        id_a, id_b = r1[0]["id"], r2[-1]["id"]
        r = h.reorder(f.repo, [id_b, id_a])
        order = {i["id"]: i["sort_order"] for i in r}
        check("reorder assigns sort_order by given sequence", order[id_b] == 0 and order[id_a] == 1)


def test_dos_and_donts_are_independent_items_same_table():
    with FreshDB() as f:
        import engine.habits as h
        h.create_habit(f.repo, "do", "Wake up early")
        h.create_habit(f.repo, "dont", "Smoking")
        r = h.list_habits(f.repo)
        kinds = sorted(i["kind"] for i in r)
        check("both kinds present in one list", kinds == ["do", "dont"])


def run_all() -> bool:
    tests = [
        test_empty_list,
        test_create_validates_kind_and_priority,
        test_streak_empty_history,
        test_streak_single_day,
        test_streak_consecutive_days,
        test_streak_breaks_at_gap,
        test_streak_breaks_at_explicit_false,
        test_streak_spans_month_boundary,
        test_checkin_is_idempotent,
        test_edit_updates_only_given_fields,
        test_delete_removes_item,
        test_reorder_sets_sort_order,
        test_dos_and_donts_are_independent_items_same_table,
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
