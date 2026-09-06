"""90-Day (or N-day) Quarterly Plan — a repeating cycle with six
whole-life areas, each answering three prompts (Outcome / weekly Action
/ If-then). See QuarterlyAnswer's docstring in database/models.py for
why this is one row per (cycle, area) rather than legacy's single
nested dict keyed by `__q90_<cycle-start>`.
"""

import datetime as dt
from datetime import date

from database.models import Q90_AREAS, Q90_CYCLE_MAX, Q90_CYCLE_MIN, QuarterlyAnswer
from database.repository import QuarterlyRepository

AREA_KEYS = tuple(a[0] for a in Q90_AREAS)
FIELD_KEYS = ("out", "act", "ifthen")


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
    including the "no anchor yet" fallback to the calendar quarter."""
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
    hasn't started yet (a future start date) — matches legacy exactly."""
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


def get_panel(repo: QuarterlyRepository, d: date | None = None) -> dict:
    key = cycle_key(repo, d)
    start, end = cycle_span(repo, d)
    day, total, left = cycle_progress(repo, d)
    rows = {a.area: a for a in repo.list_answers(key)}
    areas = []
    for area_key, label, glyph, description in Q90_AREAS:
        row = rows.get(area_key)
        areas.append({
            "key": area_key,
            "label": label,
            "glyph": glyph,
            "description": description,
            "out": row.out if row else "",
            "act": row.act if row else "",
            "ifthen": row.ifthen if row else "",
        })
    done = sum(1 for a in areas if a["out"].strip())
    return {
        "cycle_start": key,
        "cycle_end": str(end),
        "cycle_days": total,
        "day": day,
        "days_left": left,
        "areas_done": done,
        "areas_total": len(areas),
        "areas": areas,
    }


def set_answer(repo: QuarterlyRepository, area: str, field: str, text: str, d: date | None = None) -> dict:
    if area not in AREA_KEYS:
        raise ValueError(f"area must be one of {AREA_KEYS}")
    if field not in FIELD_KEYS:
        raise ValueError(f"field must be one of {FIELD_KEYS}")
    key = cycle_key(repo, d)
    row = repo.get_answer(key, area)
    if row is None:
        row = QuarterlyAnswer(cycle_start=key, area=area)
        setattr(row, field, text)
        repo.add_answer(row)
    else:
        setattr(row, field, text)
        repo.save_answer(row)
    return get_panel(repo, d)


def set_cycle(repo: QuarterlyRepository, start: str, days: int) -> dict:
    """Move the cycle, carrying the current cycle's answers to the new
    key — matches legacy's `_set_cycle`. Order matters: the OLD key must
    be read before AppState is updated underneath it."""
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
