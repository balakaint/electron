"""Daily DO/DON'T commitments — a standing list shown in Morning
Ritual, checked off fresh every day, each with a running streak.

Distinct from Tasks (one-off), Goals (long-horizon) and the 90-Day
Plan's weekly_lead_behavior (exactly one repeated behavior per area):
this is many small binary daily habits. See HabitItem's own docstring
in database/models.py for the storage shape and why streak is computed
here rather than kept as a stored column — same "computed, not stored"
call this app already makes for goal_board_progress and Q90's
compute_status.
"""

from datetime import date, timedelta

from database.models import HabitItem
from database.repository import HabitRepository

VALID_KINDS = ("do", "dont")
VALID_PRIORITIES = ("low", "normal", "high")


def _today() -> str:
    return str(date.today())


def _history_map(item: HabitItem) -> dict[str, bool]:
    return {row["date"]: row["done"] for row in item.history}


def streak(item: HabitItem, today: str | None = None) -> int:
    """Consecutive days checked done, walking backward from today.
    Stops at the first missing day or the first explicit done=False —
    a gap breaks the streak whether it's an unchecked day or a day the
    user actively marked as not done."""
    today_d = date.fromisoformat(today or _today())
    by_date = _history_map(item)
    count = 0
    d = today_d
    while by_date.get(str(d)) is True:
        count += 1
        d -= timedelta(days=1)
    return count


def _out(item: HabitItem, today: str | None = None) -> dict:
    today = today or _today()
    return {
        "id": item.id,
        "kind": item.kind,
        "name": item.name,
        "time": item.time,
        "priority": item.priority,
        "tracking_basis": item.tracking_basis,
        "sort_order": item.sort_order,
        "done_today": _history_map(item).get(today, False),
        "streak": streak(item, today),
    }


def list_habits(repo: HabitRepository) -> list[dict]:
    today = _today()
    return [_out(item, today) for item in repo.list()]


def create_habit(
    repo: HabitRepository, kind: str, name: str, time: str = "", priority: str = "normal", tracking_basis: str = ""
) -> list[dict]:
    if kind not in VALID_KINDS:
        raise ValueError(f"invalid kind: {kind}")
    if priority not in VALID_PRIORITIES:
        raise ValueError(f"invalid priority: {priority}")
    name = name.strip()
    if not name:
        raise ValueError("name is required")
    existing = repo.list()
    next_order = max((i.sort_order for i in existing), default=-1) + 1
    repo.add(
        HabitItem(
            kind=kind,
            name=name,
            time=time.strip(),
            priority=priority,
            tracking_basis=tracking_basis.strip(),
            sort_order=next_order,
        )
    )
    return list_habits(repo)


def edit_habit(
    repo: HabitRepository,
    item_id: int,
    name: str | None = None,
    time: str | None = None,
    priority: str | None = None,
    tracking_basis: str | None = None,
) -> list[dict]:
    item = repo.get(item_id)
    if item is None:
        raise ValueError(f"no habit item {item_id}")
    if name is not None:
        name = name.strip()
        if not name:
            raise ValueError("name is required")
        item.name = name
    if time is not None:
        item.time = time.strip()
    if priority is not None:
        if priority not in VALID_PRIORITIES:
            raise ValueError(f"invalid priority: {priority}")
        item.priority = priority
    if tracking_basis is not None:
        item.tracking_basis = tracking_basis.strip()
    repo.save(item)
    return list_habits(repo)


def checkin(repo: HabitRepository, item_id: int, day: str, done: bool) -> list[dict]:
    """Upsert `day`'s entry in the item's history — idempotent, checking
    the same day twice just overwrites rather than duplicating."""
    item = repo.get(item_id)
    if item is None:
        raise ValueError(f"no habit item {item_id}")
    history = [row for row in item.history if row["date"] != day]
    history.append({"date": day, "done": done})
    item.history = history
    repo.save(item)
    return list_habits(repo)


def delete_habit(repo: HabitRepository, item_id: int) -> list[dict]:
    item = repo.get(item_id)
    if item is not None:
        repo.delete(item)
    return list_habits(repo)


def reorder(repo: HabitRepository, ids: list[int]) -> list[dict]:
    items = {i.id: i for i in repo.list()}
    for order, item_id in enumerate(ids):
        item = items.get(item_id)
        if item is not None:
            item.sort_order = order
    for item in items.values():
        repo.save(item)
    return list_habits(repo)
