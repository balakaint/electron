from typing import Literal

from pydantic import BaseModel, ConfigDict

ListKey = Literal["classic", "focus"]
Urgency = Literal["low", "med", "high"]


class TaskCreate(BaseModel):
    text: str
    list_key: ListKey = "classic"
    day: str | None = None  # ISO date; defaults to today


class TaskEdit(BaseModel):
    """Matches the legacy edit dialog: text may carry a trailing "~NN"
    time-box suffix, which the engine strips into `est`."""

    text: str


class StrikeToggle(BaseModel):
    """project_key is only meaningful when striking a task from a
    project card — matches _toggle_strike, which never guesses a
    project by wording, only ever takes it explicitly from the caller."""

    project_key: str | None = None


DayViewT = Literal["today", "tomorrow"]


class DayViewOut(BaseModel):
    view: DayViewT


class DayViewSet(BaseModel):
    view: DayViewT


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    list_key: ListKey
    text: str
    done: bool
    secs: float
    sessions: list
    est: int
    mit: bool
    day: str
    urgency: Urgency
    strike: bool
    project: str | None
    psrc: str | None


class TaskRestore(TaskOut):
    """Same shape as TaskOut — used to undo a delete by re-inserting the
    exact snapshot the client had before calling delete."""


HabitCategoryT = Literal["money", "health", "relation", "mind"]


class HabitCreate(BaseModel):
    category: HabitCategoryT
    name: str


class HabitRename(BaseModel):
    name: str


class HabitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: HabitCategoryT
    name: str
    sort_order: int
    active: bool
    done: bool = False


class CategorySummary(BaseModel):
    done: int
    total: int
    pct: int


class DaySummaryOut(BaseModel):
    day: str
    score: int
    categories: dict[str, CategorySummary]


class WeekScoreOut(BaseModel):
    day: str
    label: str
    pct: int


class IntentionSet(BaseModel):
    text: str


class IntentionOut(BaseModel):
    day: str
    text: str


ProjectKeyT = Literal["proj1", "proj2", "proj3", "proj4", "proj5", "proj6"]


class ProjectUpdate(BaseModel):
    name: str | None = None
    note: str | None = None
    detail_note: str | None = None
    note_bg: str | None = None
    note_fg: str | None = None


class TargetBump(BaseModel):
    delta: int


class ProjectOut(BaseModel):
    key: ProjectKeyT
    name: str
    accent_color: str
    note: str
    detail_note: str
    note_bg: str | None
    note_fg: str | None
    target_minutes: int
    running_since: float | None
    is_named: bool
    secs_today: float
    done_today: bool


class ProjectOrderEntry(BaseModel):
    number: int
    project: ProjectOut


class TodayProgressOut(BaseModel):
    secs: float
    target_secs: float
    pct: int
    projects_done: int
    projects_total: int


class SubtaskCreate(BaseModel):
    text: str


class SubtaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    pid: str
    project_key: ProjectKeyT
    text: str
    done: bool
    added_date: str


class ActivityEntry(BaseModel):
    day: str
    secs: float
    worked: bool


class ManualMarkSet(BaseModel):
    day: str
    mark: bool


class PersonCreate(BaseModel):
    project_key: ProjectKeyT | None = None
    name: str
    cadence_days: int = 7


class PersonUpdate(BaseModel):
    name: str | None = None
    cadence_days: int | None = None


class PersonOut(BaseModel):
    id: int
    project_key: ProjectKeyT | None
    name: str
    cadence_days: int
    last_contact: str | None
    gap_days: int | None
    overdue: bool


DecisionStatusT = Literal["", "GO", "VALIDATE", "PIVOT", "NO-GO"]
NextPriorityT = Literal["", "HIGH", "MED", "LOW"]


class BusinessAnalysisUpdate(BaseModel):
    idea_business: str | None = None
    idea_problem: str | None = None
    idea_customer: str | None = None
    idea_goal: str | None = None
    an_market: str | None = None
    an_competition: str | None = None
    an_strength: str | None = None
    an_risk: str | None = None
    fin_investment: str | None = None
    fin_cost: str | None = None
    fin_revenue: str | None = None
    fin_profit: str | None = None
    decision_why: str | None = None
    next_action: str | None = None
    next_deadline: str | None = None


class BusinessAnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_key: ProjectKeyT
    idea_business: str
    idea_problem: str
    idea_customer: str
    idea_goal: str
    an_market: str
    an_competition: str
    an_strength: str
    an_risk: str
    fin_investment: str
    fin_cost: str
    fin_revenue: str
    fin_profit: str
    decision_why: str
    decision_status: DecisionStatusT
    next_action: str
    next_priority: NextPriorityT
    next_deadline: str


class DecisionStatusSet(BaseModel):
    status: DecisionStatusT


class PrioritySet(BaseModel):
    priority: NextPriorityT


class DecisionLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_key: ProjectKeyT
    date: str
    from_status: str
    to_status: str
    why: str


class LegacyBoxOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    box_index: int
    title: str
    text: str


LogStatusT = Literal["", "ok", "no"]
JourneyEventT = Literal["launched", "advanced"] | None


class JourneyMetaUpdate(BaseModel):
    proj_name: str | None = None
    tagline: str | None = None
    cover_image: str | None = None
    attach_file: str | None = None


class StageMetaUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class GateUpdate(BaseModel):
    gate: str


class JourneyTaskCreate(BaseModel):
    text: str


class JourneyTaskEdit(BaseModel):
    text: str


class JourneyLogCreate(BaseModel):
    text: str


class JourneyTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stage_index: int
    text: str
    done: bool


class JourneyLogEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stage_index: int
    text: str
    date: str
    status: LogStatusT


class JourneyStageOut(BaseModel):
    stage_index: int
    name: str
    description: str
    gate: str
    gate_done: bool
    done: bool
    tasks: list[JourneyTaskOut]
    logs: list[JourneyLogEntryOut]


class JourneyOut(BaseModel):
    project_key: ProjectKeyT
    proj_name: str
    tagline: str
    cover_image: str
    attach_file: str
    current_stage: int
    launched: bool
    # Only non-null immediately after the one action that just triggered
    # it (a gate tick or a task toggle) — see engine.journey for why
    # nothing else fires it. A one-shot toast signal, not a status flag.
    event: JourneyEventT
    stages: list[JourneyStageOut]


GoalHorizonT = Literal["yearly", "monthly", "weekly"]


class GoalCreate(BaseModel):
    horizon: GoalHorizonT
    text: str
    start_date: str | None = None  # ISO date; defaults to today
    note: str = ""


class GoalEdit(BaseModel):
    text: str | None = None
    start_date: str | None = None
    note: str | None = None


class GoalOut(BaseModel):
    id: int
    project_key: ProjectKeyT
    horizon: GoalHorizonT
    text: str
    done: bool
    start_date: str
    done_date: str | None
    note: str
    # Derived, not stored — "day N of 30" for the progress bar, same
    # live computation legacy did at render time from start_date.
    day_number: int


class GoalPanelOut(BaseModel):
    project_key: ProjectKeyT
    sec_title_yearly: str | None
    sec_title_monthly: str | None
    sec_title_weekly: str | None


class GoalProjectSet(BaseModel):
    project_key: ProjectKeyT


class SectionTitleSet(BaseModel):
    horizon: GoalHorizonT
    title: str  # blank resets to the default label, client-side


ThemeT = Literal["focus", "warroom", "energy", "journey"]
LangT = Literal["en", "bn"]


class SettingsOut(BaseModel):
    theme: ThemeT
    onboarded: bool
    lang: LangT
    analog_clock: bool
    auto_timer_on_open: bool
    idle_stop_min: int
    phase_morning_start: int
    phase_work_start: int
    phase_evening_start: int
    phase_sleep_start: int
    goal_hours: int
    currency: str
    start_with_windows: bool


class ThemeSet(BaseModel):
    theme: ThemeT


class SettingsUpdate(BaseModel):
    """All-optional — PUT /api/settings patches only the fields sent,
    matching engine.settings.update_settings."""

    lang: LangT | None = None
    analog_clock: bool | None = None
    auto_timer_on_open: bool | None = None
    idle_stop_min: int | None = None
    phase_morning_start: int | None = None
    phase_work_start: int | None = None
    phase_evening_start: int | None = None
    phase_sleep_start: int | None = None
    goal_hours: int | None = None
    currency: str | None = None
    start_with_windows: bool | None = None


class BackupOut(BaseModel):
    """Wrapped (not a bare JSON body) so the Electron IPC bridge's
    blanket `res.json()` always has something to parse, and so the
    suggested filename travels with the payload — the bridge discards
    HTTP headers, so a Content-Disposition header would never reach
    the renderer."""

    filename: str
    data: dict


class CsvExportOut(BaseModel):
    filename: str
    csv: str
