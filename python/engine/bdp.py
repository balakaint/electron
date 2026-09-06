"""Business Plan Notes — a single global list of opportunity cards.

Replaces the legacy screen's earlier fixed 6-block layout with an
unlimited list (see BdpPlan's docstring in database/models.py). Unlike
Goals/Journey/BusinessAnalysis this is deliberately NOT project-scoped —
matches legacy's own `vision_data["self_dev"]["plans"]`, a single flat
list independent of the 6 project slots.
"""

import time
from datetime import date

from database.models import BDP_PRIORITIES, BDP_STATUSES, BdpAction, BdpPlan
from database.repository import BdpRepository

_EDITABLE_TEXT_FIELDS = (
    "opportunity", "market", "target", "niche", "model",
    "product", "service", "supplier", "timeline", "notes",
    "cost_amount", "yearly_profit",
)
_PRI_RANK = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
_KNOWN_MARKETS = ("Bangladesh", "USA", "Global")


def _today() -> str:
    return str(date.today())


def _clamp_choice(value: str | None, choices: tuple[str, ...], default: str) -> str:
    return value if value in choices else default


def _clamp_rating(value: int | None, current: int) -> int:
    if value is None:
        return current
    return max(1, min(5, int(value)))


def plan_to_dict(repo: BdpRepository, plan: BdpPlan) -> dict:
    actions = repo.list_actions(plan.id)
    return {
        "id": plan.id,
        "title": plan.title,
        "status": plan.status,
        "priority": plan.priority,
        "opportunity": plan.opportunity,
        "market": plan.market,
        "target": plan.target,
        "niche": plan.niche,
        "model": plan.model,
        "product": plan.product,
        "service": plan.service,
        "supplier": plan.supplier,
        "timeline": plan.timeline,
        "potential": plan.potential,
        "difficulty": plan.difficulty,
        "cost_amount": plan.cost_amount,
        "yearly_profit": plan.yearly_profit,
        "notes": plan.notes,
        "archived": plan.archived,
        "created": plan.created,
        "updated": plan.updated,
        "order": plan.order,
        "next_actions": [{"id": a.id, "text": a.text, "done": a.done} for a in actions],
    }


def _rank(plan: BdpPlan) -> tuple:
    """HIGH before MEDIUM before LOW; inside a priority the higher
    potential wins; ties go to whichever plan has sat around longest —
    matches legacy's `_rank` exactly (the whole point of priority-sort
    is that reading top to bottom already tells you what to look at
    first)."""
    created = plan.created or plan.updated or ""
    return (_PRI_RANK.get(plan.priority, 1), -plan.potential, created)


def list_plans(
    repo: BdpRepository,
    status: str | None = None,
    priority: str | None = None,
    market: str | None = None,
    q: str | None = None,
    sort: str | None = None,
    include_archived: bool = False,
) -> list[dict]:
    plans = repo.list_plans(include_archived=include_archived)
    if status and status != "All":
        plans = [p for p in plans if p.status == status]
    if priority and priority != "All":
        plans = [p for p in plans if p.priority == priority]
    if market and market != "All":
        if market == "Other":
            plans = [p for p in plans if (p.market or "") not in (*_KNOWN_MARKETS, "")]
        else:
            plans = [p for p in plans if (p.market or "") == market]
    ql = (q or "").strip().lower()
    if ql:
        def _matches(p: BdpPlan) -> bool:
            hay = " ".join(
                str(getattr(p, f, "") or "")
                for f in ("title", "opportunity", "market", "target", "niche",
                           "model", "product", "service", "supplier", "notes")
            ).lower()
            hay += " " + " ".join(a.text for a in repo.list_actions(p.id)).lower()
            return ql in hay
        plans = [p for p in plans if _matches(p)]

    effective_sort = sort or repo.get_app_state().bdp_sort
    if effective_sort == "priority":
        plans = sorted(plans, key=_rank)
    else:
        plans = sorted(plans, key=lambda p: p.order)
    return [plan_to_dict(repo, p) for p in plans]


def create_plan(repo: BdpRepository, title: str, **fields) -> dict:
    title = title.strip()
    if not title:
        raise ValueError("A business name is required")
    today = _today()
    existing = repo.list_plans(include_archived=True)
    order = min((p.order for p in existing), default=0.0) - 1.0  # new plan goes to the top
    plan = BdpPlan(
        id=int(time.time() * 1000),
        title=title,
        status=_clamp_choice(fields.get("status"), BDP_STATUSES, "IDEA"),
        priority=_clamp_choice(fields.get("priority"), BDP_PRIORITIES, "MEDIUM"),
        potential=_clamp_rating(fields.get("potential"), 3),
        difficulty=_clamp_rating(fields.get("difficulty"), 3),
        created=today,
        updated=today,
        order=order,
    )
    for f in _EDITABLE_TEXT_FIELDS:
        if f in fields and fields[f] is not None:
            setattr(plan, f, fields[f])
    repo.add_plan(plan)
    return plan_to_dict(repo, plan)


def edit_plan(repo: BdpRepository, plan_id: int, **fields) -> dict | None:
    plan = repo.get_plan(plan_id)
    if plan is None:
        return None
    if "title" in fields and fields["title"] is not None:
        title = fields["title"].strip()
        if title:
            plan.title = title
    if "status" in fields and fields["status"] is not None:
        plan.status = _clamp_choice(fields["status"], BDP_STATUSES, plan.status)
    if "priority" in fields and fields["priority"] is not None:
        plan.priority = _clamp_choice(fields["priority"], BDP_PRIORITIES, plan.priority)
    if "potential" in fields:
        plan.potential = _clamp_rating(fields["potential"], plan.potential)
    if "difficulty" in fields:
        plan.difficulty = _clamp_rating(fields["difficulty"], plan.difficulty)
    for f in _EDITABLE_TEXT_FIELDS:
        if f in fields and fields[f] is not None:
            setattr(plan, f, fields[f])
    plan.updated = _today()
    repo.save_plan(plan)
    return plan_to_dict(repo, plan)


def duplicate_plan(repo: BdpRepository, plan_id: int) -> dict | None:
    plan = repo.get_plan(plan_id)
    if plan is None:
        return None
    new_id = int(time.time() * 1000)
    dup = BdpPlan(
        id=new_id, title=plan.title + " (copy)", status=plan.status, priority=plan.priority,
        opportunity=plan.opportunity, market=plan.market, target=plan.target, niche=plan.niche,
        model=plan.model, product=plan.product, service=plan.service, supplier=plan.supplier,
        timeline=plan.timeline, potential=plan.potential, difficulty=plan.difficulty,
        cost_amount=plan.cost_amount, yearly_profit=plan.yearly_profit, notes=plan.notes,
        archived=False, created=plan.created, updated=plan.updated,
        order=plan.order + 0.5,  # sits right after the original in manual order
    )
    repo.add_plan(dup)
    for a in repo.list_actions(plan_id):
        repo.add_action(BdpAction(
            id=int(time.time() * 1000) + a.sort_order, plan_id=new_id,
            text=a.text, done=a.done, sort_order=a.sort_order,
        ))
    return plan_to_dict(repo, dup)


def archive_plan(repo: BdpRepository, plan_id: int) -> dict | None:
    plan = repo.get_plan(plan_id)
    if plan is None:
        return None
    plan.archived = True
    repo.save_plan(plan)
    return plan_to_dict(repo, plan)


def delete_plan(repo: BdpRepository, plan_id: int) -> bool:
    plan = repo.get_plan(plan_id)
    if plan is None:
        return False
    repo.delete_plan(plan)
    return True


def move_plan(repo: BdpRepository, plan_id: int, direction: int) -> list[dict]:
    """Button-driven stand-in for legacy's drag-to-reorder: swaps `order`
    with the adjacent plan in the manual-order list. direction=-1 moves
    it earlier, +1 moves it later. No-ops at either end of the list."""
    if direction not in (-1, 1):
        raise ValueError("direction must be -1 or 1")
    plans = sorted(repo.list_plans(include_archived=False), key=lambda p: p.order)
    idx = next((i for i, p in enumerate(plans) if p.id == plan_id), None)
    if idx is None:
        raise ValueError("Plan not found")
    swap_idx = idx + direction
    if 0 <= swap_idx < len(plans):
        a, b = plans[idx], plans[swap_idx]
        a.order, b.order = b.order, a.order
        repo.save_plan(a)
        repo.save_plan(b)
    return list_plans(repo)


def get_sort(repo: BdpRepository) -> str:
    return repo.get_app_state().bdp_sort


def set_sort(repo: BdpRepository, value: str) -> str:
    if value not in ("manual", "priority"):
        raise ValueError("sort must be 'manual' or 'priority'")
    state = repo.get_app_state()
    state.bdp_sort = value
    repo.save_app_state(state)
    return value


# ── Next-actions checklist ──────────────────────────────────────────
def add_action(repo: BdpRepository, plan_id: int, text: str) -> dict:
    plan = repo.get_plan(plan_id)
    if plan is None:
        raise ValueError("Plan not found")
    text = text.strip()
    if not text:
        raise ValueError("Action text cannot be empty")
    existing = repo.list_actions(plan_id)
    action = BdpAction(
        id=int(time.time() * 1000), plan_id=plan_id, text=text, done=False, sort_order=len(existing),
    )
    repo.add_action(action)
    return plan_to_dict(repo, plan)


def toggle_action(repo: BdpRepository, action_id: int) -> dict | None:
    action = repo.get_action(action_id)
    if action is None:
        return None
    action.done = not action.done
    repo.save_action(action)
    return plan_to_dict(repo, repo.get_plan(action.plan_id))


def edit_action(repo: BdpRepository, action_id: int, text: str) -> dict | None:
    action = repo.get_action(action_id)
    if action is None:
        return None
    text = text.strip()
    if text:
        action.text = text
        repo.save_action(action)
    return plan_to_dict(repo, repo.get_plan(action.plan_id))


def delete_action(repo: BdpRepository, action_id: int) -> dict | None:
    action = repo.get_action(action_id)
    if action is None:
        return None
    plan_id = action.plan_id
    repo.delete_action(action)
    return plan_to_dict(repo, repo.get_plan(plan_id))
