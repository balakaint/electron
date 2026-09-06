"""Cross-cutting app settings: theme, onboarding flag, and the rest of
the legacy Settings dialog (`_show_settings` in task_tracker_v3_THEMES.py)
— language, analog clock, timer behavior, day-phase hours, daily goal,
currency, and the start-with-Windows preference.

Backed by the same `AppState` singleton row used by the strike/day-view/
NOW features (see database/models.py's docstring) — reusing
`TaskRepository` here rather than introducing a separate repository
class, since that's where `get_app_state`/`save_app_state` already live
and this doesn't touch tasks otherwise.
"""

from database.repository import TaskRepository

# A reasonable subset of the legacy app's 6 named themes — matches
# THEME_ORDER's cycle order, not every palette detail.
THEMES = ("focus", "warroom", "energy", "journey")
LANGS = ("en", "bn")

_IDLE_MIN, _IDLE_MAX = 2, 120
_PHASE_MIN, _PHASE_MAX = 0, 23
_GOAL_HOURS_MIN, _GOAL_HOURS_MAX = 1, 12
_PHASE_FIELDS = ("phase_morning_start", "phase_work_start", "phase_evening_start", "phase_sleep_start")


def get_settings(repo: TaskRepository) -> dict:
    state = repo.get_app_state()
    return {
        "theme": state.theme,
        "onboarded": state.onboarded,
        "lang": state.lang,
        "analog_clock": state.analog_clock,
        "auto_timer_on_open": state.auto_timer_on_open,
        "idle_stop_min": state.idle_stop_min,
        "phase_morning_start": state.phase_morning_start,
        "phase_work_start": state.phase_work_start,
        "phase_evening_start": state.phase_evening_start,
        "phase_sleep_start": state.phase_sleep_start,
        "goal_hours": state.goal_hours,
        "currency": state.currency,
        "start_with_windows": state.start_with_windows,
    }


def set_theme(repo: TaskRepository, theme: str) -> dict:
    if theme not in THEMES:
        raise ValueError(f"theme must be one of {THEMES}")
    state = repo.get_app_state()
    state.theme = theme
    repo.save_app_state(state)
    return get_settings(repo)


def set_onboarded(repo: TaskRepository, value: bool = True) -> dict:
    state = repo.get_app_state()
    state.onboarded = value
    repo.save_app_state(state)
    return get_settings(repo)


def update_settings(
    repo: TaskRepository,
    lang: str | None = None,
    analog_clock: bool | None = None,
    auto_timer_on_open: bool | None = None,
    idle_stop_min: int | None = None,
    phase_morning_start: int | None = None,
    phase_work_start: int | None = None,
    phase_evening_start: int | None = None,
    phase_sleep_start: int | None = None,
    goal_hours: int | None = None,
    currency: str | None = None,
    start_with_windows: bool | None = None,
) -> dict:
    """Patch only the provided fields — matches the legacy dialog's
    single "Save Settings" applying every row at once, but as a partial
    update rather than requiring the whole form. Clamps mirror
    `_show_settings`'s own steppers exactly (idle 2-120min, phase hours
    0-23, goal 1-12h) rather than trusting the caller, since this is a
    real API boundary, not a widget the same dialog controls end to
    end."""
    if lang is not None and lang not in LANGS:
        raise ValueError(f"lang must be one of {LANGS}")

    state = repo.get_app_state()
    if lang is not None:
        state.lang = lang
    if analog_clock is not None:
        state.analog_clock = analog_clock
    if auto_timer_on_open is not None:
        state.auto_timer_on_open = auto_timer_on_open
    if idle_stop_min is not None:
        state.idle_stop_min = max(_IDLE_MIN, min(_IDLE_MAX, int(idle_stop_min)))
    for field, value in (
        ("phase_morning_start", phase_morning_start),
        ("phase_work_start", phase_work_start),
        ("phase_evening_start", phase_evening_start),
        ("phase_sleep_start", phase_sleep_start),
    ):
        if value is not None:
            setattr(state, field, max(_PHASE_MIN, min(_PHASE_MAX, int(value))))
    if goal_hours is not None:
        state.goal_hours = max(_GOAL_HOURS_MIN, min(_GOAL_HOURS_MAX, int(goal_hours)))
    if currency is not None:
        # Same fallback-to-"$"-on-blank and 4-char cap as the legacy
        # dialog's _apply (an empty currency field silently keeping the
        # old value would be more surprising than resetting it).
        state.currency = (currency.strip() or "$")[:4]
    if start_with_windows is not None:
        state.start_with_windows = start_with_windows

    repo.save_app_state(state)
    return get_settings(repo)
