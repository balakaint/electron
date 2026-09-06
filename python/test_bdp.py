"""Idempotent regression test for Business Plan Notes (BDP). No pytest
dependency:

    .venv/bin/python test_bdp.py

Every test gets its own fresh temp SQLite DB, deleted immediately after
— never touches the real app.db.
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

        from database.repository import BdpRepository

        self.db = connection.SessionLocal()
        self.repo = BdpRepository(self.db)
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


def test_seed_data_present():
    with FreshDB() as f:
        import engine.bdp as bdp
        plans = bdp.list_plans(f.repo)
        check("6 starter plans seeded", len(plans) == 6, f"got {len(plans)}")
        check("seeded plans have actions", all(len(p["next_actions"]) > 0 for p in plans))
        check("seeded plans default to manual sort order", plans[0]["title"] == "SUPPLEMENT BUSINESS")


def test_create_requires_title():
    with FreshDB() as f:
        import engine.bdp as bdp
        try:
            bdp.create_plan(f.repo, "   ")
            raised = False
        except ValueError:
            raised = True
        check("blank title raises ValueError", raised)


def test_create_new_plan_goes_to_top():
    with FreshDB() as f:
        import engine.bdp as bdp
        plan = bdp.create_plan(f.repo, "New Idea", priority="HIGH", market="Bangladesh")
        f.db.commit()
        plans = bdp.list_plans(f.repo)
        check("new plan sorts first in manual order", plans[0]["id"] == plan["id"])
        check("created/updated stamped on a real create", bool(plan["created"]) and bool(plan["updated"]))
        check("unset fields default sensibly", plan["status"] == "IDEA" and plan["potential"] == 3)


def test_edit_clamps_and_ignores_invalid_choices():
    with FreshDB() as f:
        import engine.bdp as bdp
        plan = bdp.create_plan(f.repo, "Clamp Check")
        f.db.commit()
        edited = bdp.edit_plan(f.repo, plan["id"], potential=999, difficulty=-5, status="NOT-A-STATUS")
        check("potential clamped to max 5", edited["potential"] == 5)
        check("difficulty clamped to min 1", edited["difficulty"] == 1)
        check("invalid status falls back to previous value", edited["status"] == "IDEA")


def test_duplicate_copies_actions():
    with FreshDB() as f:
        import engine.bdp as bdp
        plans = bdp.list_plans(f.repo)
        original = plans[0]
        dup = bdp.duplicate_plan(f.repo, original["id"])
        f.db.commit()
        check("duplicate title suffixed with (copy)", dup["title"] == original["title"] + " (copy)")
        check(
            "duplicate carries the same actions (as new independent rows)",
            len(dup["next_actions"]) == len(original["next_actions"])
            and dup["next_actions"][0]["id"] != original["next_actions"][0]["id"],
        )


def test_archive_hides_from_default_list_but_not_from_include_archived():
    with FreshDB() as f:
        import engine.bdp as bdp
        plans = bdp.list_plans(f.repo)
        target_id = plans[0]["id"]
        bdp.archive_plan(f.repo, target_id)
        f.db.commit()
        visible = bdp.list_plans(f.repo)
        all_plans = bdp.list_plans(f.repo, include_archived=True)
        check("archived plan disappears from default list", all(p["id"] != target_id for p in visible))
        check("archived plan still present with include_archived=True", any(p["id"] == target_id for p in all_plans))


def test_delete_removes_plan_and_actions():
    with FreshDB() as f:
        import engine.bdp as bdp
        from database.models import BdpAction
        plans = bdp.list_plans(f.repo)
        target_id = plans[0]["id"]
        ok = bdp.delete_plan(f.repo, target_id)
        f.db.commit()
        check("delete_plan returns True for a real plan", ok)
        check("delete_plan returns False for an already-gone plan", bdp.delete_plan(f.repo, target_id) is False)
        orphans = f.db.query(BdpAction).filter(BdpAction.plan_id == target_id).all()
        check("deleting a plan also deletes its actions (no orphans)", orphans == [])


def test_actions_crud():
    with FreshDB() as f:
        import engine.bdp as bdp
        plan = bdp.create_plan(f.repo, "Action Test")
        f.db.commit()
        result = bdp.add_action(f.repo, plan["id"], "  write the plan  ")
        f.db.commit()
        check("action text is trimmed", result["next_actions"][0]["text"] == "write the plan")
        action_id = result["next_actions"][0]["id"]

        toggled = bdp.toggle_action(f.repo, action_id)
        check("toggle flips done to True", toggled["next_actions"][0]["done"] is True)
        toggled_back = bdp.toggle_action(f.repo, action_id)
        check("toggle again flips back to False", toggled_back["next_actions"][0]["done"] is False)

        edited = bdp.edit_action(f.repo, action_id, "revised text")
        check("edit_action updates text", edited["next_actions"][0]["text"] == "revised text")

        after_delete = bdp.delete_action(f.repo, action_id)
        check("delete_action removes it", after_delete["next_actions"] == [])

        check("toggling a nonexistent action returns None", bdp.toggle_action(f.repo, 999999) is None)


def test_filters_status_priority_market():
    with FreshDB() as f:
        import engine.bdp as bdp
        by_status = bdp.list_plans(f.repo, status="OPPORTUNITY")
        check("status filter matches only OPPORTUNITY plans", all(p["status"] == "OPPORTUNITY" for p in by_status)
              and len(by_status) > 0)

        by_pri = bdp.list_plans(f.repo, priority="HIGH")
        check("priority filter matches only HIGH plans", all(p["priority"] == "HIGH" for p in by_pri) and len(by_pri) > 0)

        by_market = bdp.list_plans(f.repo, market="USA")
        check("market filter matches only USA plans", all(p["market"] == "USA" for p in by_market) and len(by_market) > 0)

        other = bdp.list_plans(f.repo, market="Other")
        check(
            "market=Other excludes Bangladesh/USA/Global/blank",
            all(p["market"] not in ("Bangladesh", "USA", "Global", "") for p in other) and len(other) > 0,
        )


def test_search_matches_text_and_actions():
    with FreshDB() as f:
        import engine.bdp as bdp
        by_title = bdp.list_plans(f.repo, q="amazon")
        check("search matches title case-insensitively", len(by_title) == 1 and "AMAZON" in by_title[0]["title"])

        by_action = bdp.list_plans(f.repo, q="shopify setup")
        check("search matches next-action text", len(by_action) == 1 and by_action[0]["title"] == "PRINT ON DEMAND STORE")

        no_match = bdp.list_plans(f.repo, q="totally-unmatched-xyz")
        check("search with no match returns empty", no_match == [])


def test_sort_modes():
    with FreshDB() as f:
        import engine.bdp as bdp
        manual = bdp.list_plans(f.repo, sort="manual")
        check("manual sort matches seeded order field", [p["title"] for p in manual][0] == "SUPPLEMENT BUSINESS")

        by_priority = bdp.list_plans(f.repo, sort="priority")
        prios = [p["priority"] for p in by_priority]
        check("priority sort puts all HIGH plans before MEDIUM/LOW", prios == sorted(prios, key=lambda p: {"HIGH": 0, "MEDIUM": 1, "LOW": 2}[p]))

        f.repo.get_app_state()
        bdp.set_sort(f.repo, "priority")
        f.db.commit()
        check("get_sort reflects the persisted value", bdp.get_sort(f.repo) == "priority")

        try:
            bdp.set_sort(f.repo, "random")
            raised = False
        except ValueError:
            raised = True
        check("invalid sort value raises ValueError", raised)


def test_move_swaps_with_neighbor_and_noops_at_edges():
    with FreshDB() as f:
        import engine.bdp as bdp
        plans = bdp.list_plans(f.repo, sort="manual")
        first_id, second_id = plans[0]["id"], plans[1]["id"]

        moved = bdp.move_plan(f.repo, second_id, -1)
        f.db.commit()
        check("moving the 2nd plan up swaps it with the 1st", moved[0]["id"] == second_id and moved[1]["id"] == first_id)

        noop = bdp.move_plan(f.repo, second_id, -1)  # now first — moving up again should no-op
        check("moving the first plan further up is a no-op", noop[0]["id"] == second_id)

        last_id = bdp.list_plans(f.repo, sort="manual")[-1]["id"]
        noop_end = bdp.move_plan(f.repo, last_id, 1)
        check("moving the last plan further down is a no-op", noop_end[-1]["id"] == last_id)


def run_all():
    tests = [
        test_seed_data_present,
        test_create_requires_title,
        test_create_new_plan_goes_to_top,
        test_edit_clamps_and_ignores_invalid_choices,
        test_duplicate_copies_actions,
        test_archive_hides_from_default_list_but_not_from_include_archived,
        test_delete_removes_plan_and_actions,
        test_actions_crud,
        test_filters_status_priority_market,
        test_search_matches_text_and_actions,
        test_sort_modes,
        test_move_swaps_with_neighbor_and_noops_at_edges,
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
