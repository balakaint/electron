"""90-Day (or N-day) Quarterly Plan — a repeating cycle with six
whole-life areas. See QuarterlyAnswer's docstring in database/models.py
for why this is one row per (cycle, area) rather than legacy's single
nested dict keyed by `__q90_<cycle-start>`.

V2 (2026-09-16) — "112-Day Transformation Board", from Zahid's own
detailed spec. Each area now walks a 7-step sequence instead of the old
flat Outcome/weekly-Action/If-then shape:

    current_reality -> destination (+ proof) -> gap -> major_changes
    -> weekly_lead_behavior -> obstacle_if/response_then
    -> review & recalibrate (achieved / change_destination)

`compute_status` derives NOT STARTED / DEFINED / PLANNED / ACTIVE /
PROVEN from what's actually filled in — there is no separate stored
status field, same "computed, not stored" convention as
`goal_board_progress` and `goal_top_focus_card_title` elsewhere in this
app. PROVEN specifically requires the explicit `achieved` action (not
just every field being filled) — Zahid's own instruction: filling in
fields is not the same as actually proving the outcome.
"""

import datetime as dt
from datetime import date, datetime

from database.models import Q90_AREAS, Q90_CYCLE_MAX, Q90_CYCLE_MIN, Q90AreaMeta, QuarterlyAnswer
from database.repository import QuarterlyRepository

AREA_KEYS = tuple(a[0] for a in Q90_AREAS)
AREA_DEFAULTS = {a[0]: (a[1], a[3]) for a in Q90_AREAS}  # area_key -> (label, description)

# The two area-identity fields a user can rename, distinct from the
# 7-step FIELD_KEYS below (those are per-cycle answers; these are the
# area's own name, global across cycles — see Q90AreaMeta's docstring).
META_FIELD_KEYS = ("label", "description")

# The 7 free-text fields settable through the generic `set_field`.
# `achieved` (bool), `major_changes` (list) and destination-versioning
# each have their own dedicated setter below since they aren't plain
# text writes.
FIELD_KEYS = (
    "current_reality",
    "destination",
    "proof",
    "gap",
    "weekly_lead_behavior",
    "obstacle_if",
    "response_then",
)

MAX_MAJOR_CHANGES = 5


def _today() -> date:
    return date.today()


def clamp_cycle_days(value) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        n = 90
    return max(Q90_CYCLE_MIN, min(Q90_CYCLE_MAX, n))


def get_cycle_days(repo: QuarterlyRepository) -> int:
    return clamp_cycle_days(repo.get_app_state().q90_cycle_days)


def cycle_span(repo: QuarterlyRepository, d: date | None = None) -> tuple[date, date]:
    """(start, end) of the cycle containing `d`. Cycles REPEAT forward
    from the chosen anchor rather than expiring, and never resolve
    backward past the anchor — matches legacy's `_cycle_span` exactly,
    including the "no anchor yet" fallback to the calendar quarter.
    UNCHANGED by the V2 rewrite."""
    d = d or _today()
    n = get_cycle_days(repo)
    state = repo.get_app_state()
    anchor = None
    if state.q90_cycle_start:
        try:
            anchor = date.fromisoformat(state.q90_cycle_start)
        except ValueError:
            anchor = None
    if anchor is None:
        m = 3 * ((d.month - 1) // 3) + 1
        qs = date(d.year, m, 1)
        ny, nm = (d.year + 1, 1) if m == 10 else (d.year, m + 3)
        return qs, date(ny, nm, 1) - dt.timedelta(days=1)
    if d < anchor:
        return anchor, anchor + dt.timedelta(days=n - 1)
    start = anchor + dt.timedelta(days=((d - anchor).days // n) * n)
    return start, start + dt.timedelta(days=n - 1)


def cycle_progress(repo: QuarterlyRepository, d: date | None = None) -> tuple[int, int, int]:
    """(day_number, total_days, days_left). day is 0 when the cycle
    hasn't started yet (a future start date) — matches legacy exactly.
    UNCHANGED by the V2 rewrite."""
    d = d or _today()
    start, end = cycle_span(repo, d)
    total = (end - start).days + 1
    if d < start:
        return 0, total, total + (start - d).days
    day = min(total, (d - start).days + 1)
    return day, total, total - day


def cycle_key(repo: QuarterlyRepository, d: date | None = None) -> str:
    start, _ = cycle_span(repo, d)
    return str(start)


def compute_status(row: QuarterlyAnswer | None) -> str:
    """Derive the area's status from what's actually filled in.
    Precedence, each stage strictly requiring the one before it:

      not_started — current_reality or destination still empty
      defined     — both set, but no gap + major changes yet
      planned     — gap identified and at least one major change listed
      active      — a weekly lead behavior is defined (in execution)
      proven      — explicitly marked achieved, with proof recorded

    `achieved` alone (without `proof`) does NOT reach "proven" — Zahid's
    spec is explicit that PROVEN needs evidence, not just a checkbox.
    """
    if row is None:
        return "not_started"
    if row.achieved and row.proof.strip():
        return "proven"
    if not row.current_reality.strip() or not row.destination.strip():
        return "not_started"
    if row.weekly_lead_behavior.strip():
        return "active"
    if row.gap.strip() and row.major_changes:
        return "planned"
    return "defined"


def _area_dict(area_key: str, label: str, glyph: str, description: str, row: QuarterlyAnswer | None) -> dict:
    return {
        "key": area_key,
        "label": label,
        "glyph": glyph,
        "description": description,
        "current_reality": row.current_reality if row else "",
        "destination": row.destination if row else "",
        "proof": row.proof if row else "",
        "achieved": row.achieved if row else False,
        "gap": row.gap if row else "",
        "major_changes": row.major_changes if row else [],
        "weekly_lead_behavior": row.weekly_lead_behavior if row else "",
        "obstacle_if": row.obstacle_if if row else "",
        "response_then": row.response_then if row else "",
        "goal_version": row.goal_version if row else 1,
        "goal_history": row.goal_history if row else [],
        "week_checks": sorted(set(row.week_checks or [])) if row else [],
        "status": compute_status(row),
    }


def _area_defs(repo: QuarterlyRepository) -> list[tuple[str, str, str, str]]:
    """Q90_AREAS' (key, label, glyph, description) rows, with any saved
    Q90AreaMeta override applied to label/description, sorted by
    sort_order. glyph is never user-editable (no icon picker), so it
    always comes from the default. A blanked-out override (someone
    clears the field down to empty and blurs) falls back to the
    default rather than shipping an unnamed area — same "never end up
    blank" rule set_area_meta's caller relies on. An area with no meta
    row yet sorts by its original Q90_AREAS position, so an
    unreordered panel reads exactly as it always has."""
    metas = {m.area_key: m for m in repo.list_area_meta()}
    rows = []
    for i, (area_key, def_label, glyph, def_description) in enumerate(Q90_AREAS):
        m = metas.get(area_key)
        label = m.label.strip() if m and m.label.strip() else def_label
        description = m.description.strip() if m and m.description.strip() else def_description
        order = m.sort_order if m else i
        rows.append((order, area_key, label, glyph, description))
    rows.sort(key=lambda r: r[0])
    return [(area_key, label, glyph, description) for _, area_key, label, glyph, description in rows]


def get_panel(repo: QuarterlyRepository, d: date | None = None) -> dict:
    key = cycle_key(repo, d)
    start, end = cycle_span(repo, d)
    day, total, left = cycle_progress(repo, d)
    rows = {a.area: a for a in repo.list_answers(key)}
    areas = [
        _area_dict(area_key, label, glyph, description, rows.get(area_key))
        for area_key, label, glyph, description in _area_defs(repo)
    ]
    # "Done" now means PROVEN, not just filled in — matches the status
    # precedence above and keeps the top-level AREAS progress indicator
    # honest about actual outcomes rather than form completion.
    done = sum(1 for a in areas if a["status"] == "proven")
    focus = repo.get_app_state().q90_focus_area
    return {
        "focus_area": focus if focus in AREA_KEYS else None,
        "weeks_total": -(-total // 7),
        # 0 before the cycle starts; the week that holds today otherwise.
        "current_week": 0 if day == 0 else -(-day // 7),
        "cycle_start": key,
        "cycle_end": str(end),
        "cycle_days": total,
        "day": day,
        "days_left": left,
        "areas_done": done,
        "areas_total": len(areas),
        "areas": areas,
    }


def _get_or_create_row(repo: QuarterlyRepository, area: str, d: date | None) -> QuarterlyAnswer:
    if area not in AREA_KEYS:
        raise ValueError(f"area must be one of {AREA_KEYS}")
    key = cycle_key(repo, d)
    row = repo.get_answer(key, area)
    if row is None:
        row = QuarterlyAnswer(cycle_start=key, area=area)
        repo.add_answer(row)
    return row


def set_field(repo: QuarterlyRepository, area: str, field: str, text: str, d: date | None = None) -> dict:
    """Generic setter for the 7 free-text fields of the 7-step sequence
    (current_reality / destination / proof / gap / weekly_lead_behavior
    / obstacle_if / response_then). Replaces the old `set_answer`, which
    only knew about out/act/ifthen."""
    if field not in FIELD_KEYS:
        raise ValueError(f"field must be one of {FIELD_KEYS}")
    row = _get_or_create_row(repo, area, d)
    setattr(row, field, text)
    repo.save_answer(row)
    return get_panel(repo, d)


def set_achieved(repo: QuarterlyRepository, area: str, achieved: bool, d: date | None = None) -> dict:
    """Explicit achieved/not-achieved toggle — the action that (combined
    with a non-empty `proof`) moves an area to PROVEN. Deliberately a
    separate action from filling in fields, per Zahid's instruction that
    proof must be an explicit step, not an inferred one."""
    row = _get_or_create_row(repo, area, d)
    row.achieved = bool(achieved)
    repo.save_answer(row)
    return get_panel(repo, d)


def set_major_changes(repo: QuarterlyRepository, area: str, changes: list, d: date | None = None) -> dict:
    """Whole-array replace for the area's major-changes list (max 5, per
    spec — a plan with more than 5 "major" changes isn't really major
    anymore). Each item is a dict shaped `{id, text, done}`; missing ids
    are auto-assigned so the frontend can send bare `{text, done}` rows
    for anything new."""
    if not isinstance(changes, list):
        raise ValueError("changes must be a list")
    if len(changes) > MAX_MAJOR_CHANGES:
        raise ValueError(f"a maximum of {MAX_MAJOR_CHANGES} major changes is allowed")
    next_id = 1
    normalized = []
    for item in changes:
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        item_id = item.get("id")
        if not isinstance(item_id, int):
            item_id = next_id
        next_id = max(next_id, item_id + 1)
        normalized.append({"id": item_id, "text": text, "done": bool(item.get("done", False))})
    row = _get_or_create_row(repo, area, d)
    row.major_changes = normalized
    repo.save_answer(row)
    return get_panel(repo, d)


def change_destination(
    repo: QuarterlyRepository,
    area: str,
    new_destination: str,
    reason: str,
    evidence: str,
    d: date | None = None,
) -> dict:
    """"Change Goal" from the Review & Recalibrate step: the old
    destination is archived into `goal_history` (with the stated reason
    and evidence, and a timestamp), `goal_version` increments, and the
    area's destination becomes `new_destination`.

    Interpretive call (flagged for Zahid to confirm, not stated verbatim
    in the spec): changing the destination also resets `achieved`/`proof`
    — proof of the OLD destination shouldn't silently count as proof of
    a new one. `current_reality`, `gap`, `major_changes` and
    `weekly_lead_behavior` are left untouched; "Change Strategy" (a
    separate, lighter action — see `reset_strategy` below) is what resets
    those without touching the destination itself.
    """
    new_destination = (new_destination or "").strip()
    if not new_destination:
        raise ValueError("new_destination is required")
    row = _get_or_create_row(repo, area, d)
    history_entry = {
        "destination": row.destination,
        "reason": reason or "",
        "evidence": evidence or "",
        "changed_at": datetime.now().isoformat(timespec="seconds"),
    }
    row.goal_history = [*row.goal_history, history_entry]
    row.goal_version = row.goal_version + 1
    row.destination = new_destination
    row.achieved = False
    row.proof = ""
    repo.save_answer(row)
    return get_panel(repo, d)


def reset_strategy(repo: QuarterlyRepository, area: str, d: date | None = None) -> dict:
    """"Change Strategy" from Review & Recalibrate: the destination is
    unchanged (the goal still stands) but the "how" is cleared so the
    area drops back to DEFINED and can be re-planned — gap,
    major_changes, weekly_lead_behavior and the obstacle/response pair
    are all cleared. Interpretive call (flagged for Zahid): this is my
    reading of "Change Strategy" as distinct from "Change Goal"; not
    spelled out field-by-field in the spec itself."""
    row = _get_or_create_row(repo, area, d)
    row.gap = ""
    row.major_changes = []
    row.weekly_lead_behavior = ""
    row.obstacle_if = ""
    row.response_then = ""
    repo.save_answer(row)
    return get_panel(repo, d)


def set_area_meta(repo: QuarterlyRepository, area: str, field: str, text: str) -> dict:
    """Rename an area's label or tweak its description — the "head" of
    each area card. Global and cycle-independent (see Q90AreaMeta's
    docstring): unlike set_field, this never touches QuarterlyAnswer.
    An empty/whitespace-only save still writes the row (so a save
    confirmation is honest), but _area_defs falls back to the
    Q90_AREAS default when reading it back, so the area can't end up
    with a blank name in the UI."""
    if area not in AREA_KEYS:
        raise ValueError(f"area must be one of {AREA_KEYS}")
    if field not in META_FIELD_KEYS:
        raise ValueError(f"field must be one of {META_FIELD_KEYS}")
    meta = repo.get_area_meta(area)
    if meta is None:
        default_label, default_description = AREA_DEFAULTS[area]
        meta = Q90AreaMeta(area_key=area, label=default_label, description=default_description)
        setattr(meta, field, text)
        repo.add_area_meta(meta)
    else:
        setattr(meta, field, text)
        repo.save_area_meta(meta)
    return get_panel(repo)


def reorder_areas(repo: QuarterlyRepository, order: list[str]) -> dict:
    """Drag-to-reorder: `order` is the full 6-key list in its new
    top-to-bottom position. Writes an explicit sort_order for every
    area in the same pass (not just the two that visibly swapped) —
    see Q90AreaMeta.sort_order's own docstring for why a partial write
    would leave ordering ambiguous against areas still on their
    implicit Q90_AREAS-index default."""
    if sorted(order) != sorted(AREA_KEYS):
        raise ValueError(f"order must contain exactly {AREA_KEYS}, each once")
    for i, area in enumerate(order):
        meta = repo.get_area_meta(area)
        if meta is None:
            default_label, default_description = AREA_DEFAULTS[area]
            meta = Q90AreaMeta(area_key=area, label=default_label, description=default_description, sort_order=i)
            repo.add_area_meta(meta)
        else:
            meta.sort_order = i
            repo.save_area_meta(meta)
    return get_panel(repo)


def set_cycle(repo: QuarterlyRepository, start: str, days: int) -> dict:
    """Move the cycle, carrying the current cycle's answers to the new
    key — matches legacy's `_set_cycle`. Order matters: the OLD key must
    be read before AppState is updated underneath it. UNCHANGED by the
    V2 rewrite."""
    try:
        new_start = date.fromisoformat(start)
    except ValueError:
        raise ValueError("start must be an ISO date (YYYY-MM-DD)")
    days = clamp_cycle_days(days)
    old_key = cycle_key(repo)
    state = repo.get_app_state()
    state.q90_cycle_start = str(new_start)
    state.q90_cycle_days = days
    repo.save_app_state(state)
    new_key = cycle_key(repo)
    if new_key != old_key:
        repo.rename_cycle(old_key, new_key)
    return get_panel(repo)


def set_focus(repo: QuarterlyRepository, area: str | None) -> dict:
    """Star one area as this cycle's focus (None clears it)."""
    if area is not None and area not in AREA_KEYS:
        raise ValueError(f"area must be one of {AREA_KEYS}")
    state = repo.get_app_state()
    state.q90_focus_area = area
    repo.save_app_state(state)
    return get_panel(repo)


def set_week_check(repo: QuarterlyRepository, area: str, week: int, done: bool, d: date | None = None) -> dict:
    """Tick (or untick) week `week` (1-based) of the current cycle for an
    area's weekly routine. Weeks that haven't started can't be ticked —
    a check says the routine happened, not that it will."""
    panel = get_panel(repo, d)
    if not 1 <= week <= panel["weeks_total"]:
        raise ValueError("week is outside this cycle")
    if week > panel["current_week"]:
        raise ValueError("that week hasn't started yet")
    row = _get_or_create_row(repo, area, d)
    weeks = set(row.week_checks or [])
    weeks.add(week) if done else weeks.discard(week)
    row.week_checks = sorted(weeks)
    repo.save_answer(row)
    return get_panel(repo, d)
