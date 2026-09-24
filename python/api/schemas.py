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


class TaskDaySet(BaseModel):
    day: str  # ISO date


TaskMoveDirectionT = Literal[-1, 1]


class TaskMove(BaseModel):
    direction: TaskMoveDirectionT


class TaskTitleOut(BaseModel):
    title: str


class TaskTitleSet(BaseModel):
    title: str


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
    hour_slot_id: int | None = None
    sort_order: int


class TaskRestore(TaskOut):
    """Same shape as TaskOut — used to undo a delete by re-inserting the
    exact snapshot the client had before calling delete."""


class MitPromptOut(BaseModel):
    show: bool
    tasks: list[TaskOut]


# The flat Money/Health/Relation/Mind habit checklist and its Win/
# Reflection/Intention daily-note siblings (HabitCreate/HabitRename/
# HabitOut/CategorySummary/DaySummaryOut/WeekScoreOut/MonthlyReportOut/
# IntentionSet/IntentionOut/WinOut/ReflectionOut) were removed
# 2026-09-14 along with the checklist itself and the Life Execution
# Board that showed them (Zahid: "emon task list mainly regular chek
# kora hoy na"). Only Mindset survives — MindsetSet replaces the old
# shared IntentionSet payload shape now that "intention" is gone.
class MindsetSet(BaseModel):
    text: str


class MindsetOut(BaseModel):
    day: str
    mindset: str


class MindsetHistoryEntry(BaseModel):
    day: str
    label: str
    text: str


class DesignTodaySet(BaseModel):
    text: str


class DesignTodayOut(BaseModel):
    day: str
    text: str


ProjectKeyT = Literal["proj1", "proj2", "proj3", "proj4", "proj5", "proj6"]


class ProjectUpdate(BaseModel):
    name: str | None = None
    note: str | None = None
    detail_note: str | None = None
    note_title: str | None = None
    note_bg: str | None = None
    note_fg: str | None = None
    collapsed: bool | None = None


class TargetBump(BaseModel):
    delta: int


class ProjectOut(BaseModel):
    key: ProjectKeyT
    name: str
    accent_color: str
    note: str
    detail_note: str
    note_title: str
    note_bg: str | None
    note_fg: str | None
    target_minutes: int
    running_since: float | None
    is_named: bool
    secs_today: float
    done_today: bool
    collapsed: bool


class ProjectOrderEntry(BaseModel):
    number: int
    project: ProjectOut


class TodayProgressOut(BaseModel):
    secs: float
    target_secs: float
    pct: int
    projects_done: int
    projects_total: int


TrendDaysT = Literal[30, 90]


class TrendOut(BaseModel):
    days: list[str]
    secs: list[float]
    goal: float


class TrendDaysOut(BaseModel):
    trend_days: TrendDaysT


class TrendDaysSet(BaseModel):
    trend_days: TrendDaysT


class StreakOut(BaseModel):
    streak_days: int


class WeekSummaryOut(BaseModel):
    has_data: bool
    total_secs: int
    hit_days: int
    best_day: str | None
    best_secs: int


class CapacityInsightOut(BaseModel):
    insight: str | None


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
    feelings_negative: str | None = None
    feelings_positive: str | None = None
    thoughts_negative: str | None = None
    thoughts_positive: str | None = None
    beliefs_negative: str | None = None
    beliefs_positive: str | None = None
    actions_negative: str | None = None
    actions_positive: str | None = None
    next_action: str | None = None
    next_deadline: str | None = None
    next_who: str | None = None
    next_when: str | None = None
    next_time: str | None = None
    next_done_when: str | None = None
    attach_path: str | None = None


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
    feelings_negative: str
    feelings_positive: str
    thoughts_negative: str
    thoughts_positive: str
    beliefs_negative: str
    beliefs_positive: str
    actions_negative: str
    actions_positive: str
    next_action: str
    next_priority: NextPriorityT
    next_deadline: str
    next_who: str
    next_when: str
    next_time: str
    next_done_when: str
    attach_path: str


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

# A goal's owner: one of the 6 real projects, or the reserved "life" key —
# panel 2's header shows "LIFE PLAN" instead of a project name for it, but
# it is otherwise an ordinary owner of weekly/monthly/yearly goals (same
# GoalsPanel component, same CRUD). Deliberately its own type rather than
# widening ProjectKeyT itself: ProjectKeyT also types real Project rows
# (ProjectOut/ProjectUpdate/the /api/projects/{key} routes), and "life" has
# no row there — see database/models.py's Goal.project_key comment and
# migration `26f6de8766a5` for why.
GoalOwnerKeyT = Literal["proj1", "proj2", "proj3", "proj4", "proj5", "proj6", "life"]


class GoalCreate(BaseModel):
    horizon: GoalHorizonT
    text: str
    start_date: str | None = None  # ISO date; defaults to today
    note: str = ""
    next_action: str = ""
    # ISO date; None means "compute the horizon default" — see
    # engine.goals._default_deadline. Accepted here so a caller CAN set
    # it at creation, though the panel's own composer doesn't expose
    # that yet (it's editable via the calendar picker right after
    # creating, in the expanded goal row).
    deadline: str | None = None


class GoalEdit(BaseModel):
    text: str | None = None
    start_date: str | None = None
    note: str | None = None
    next_action: str | None = None
    deadline: str | None = None


class GoalOut(BaseModel):
    id: int
    project_key: GoalOwnerKeyT
    horizon: GoalHorizonT
    text: str
    done: bool
    start_date: str
    done_date: str | None
    note: str
    next_action: str
    # Stored, user-editable via a calendar picker — defaults to a
    # horizon-based window at creation (7 days / 30 days / 12 months,
    # see engine.goals._default_deadline) but is ordinary state after
    # that, same as start_date. Supersedes the old pure-display "start +
    # a hardcoded 30-day window regardless of horizon" computation.
    deadline: str
    # Derived, not stored — "day N of (days between start_date and
    # deadline)" for the progress bar, same live computation legacy did
    # at render time from start_date, now against the real per-goal
    # deadline instead of a hardcoded 30.
    day_number: int
    # Derived, not stored — how many of this goal's Individual Task
    # Board cards (across ALL its tasks) sit in the "done" column, out
    # of how many exist at all. Computed at the route layer (see
    # engine/board.py's goal_board_progress) by joining board_tasks and
    # board_cards, since GoalEngine has no reason to depend on the board
    # tables for every goal read. board_total is 0 for the (typical)
    # goal that has never opened its Board — the UI reads that as "no
    # board data yet", not "0% done".
    board_done: int
    board_total: int
    # How many of those same cards sit in "focus" — added alongside
    # GoalBoardOverlay's Goal/Plans/Actions/Results progress steps
    # (2026-09-16, from Zahid's attached spec): "Actions" lights up once
    # something is actually in focus, which board_done/board_total alone
    # can't tell apart from "nothing has been queued yet".
    board_focus: int
    # Derived, not stored — the title of the goal's own "top" FOCUS
    # card (pinned first, then oldest — same ordering BoardCardRepository
    # already uses within one task's board) across EVERY task under this
    # goal. Added 2026-09-16 so GoalsPanel's own NEXT ACTION field can
    # default to "what's actually in front of you on the board" instead
    # of staying an empty manual field until someone types into it —
    # Zahid's own words: "next action by default its board 1st focused
    # 1st card name". None when nothing is in FOCUS anywhere on this
    # goal's boards (the field then falls back to the example
    # placeholder, same as before).
    board_focus_title: str | None


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


# A goal's own flat checklist — mirrors SubtaskCreate/SubtaskOut above,
# scoped to goal_id instead of project_key. See GoalTask's own docstring.
class GoalTaskCreate(BaseModel):
    text: str


class GoalTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    pid: str
    goal_id: int
    text: str
    done: bool
    added_date: str


class OutcomeCreate(BaseModel):
    title: str
    year: int


class OutcomeEdit(BaseModel):
    title: str | None = None
    status: str | None = None


class OutcomeOut(BaseModel):
    id: int
    owner_key: GoalOwnerKeyT
    title: str
    year: int
    status: str
    fixed: bool
    progress: int
    legacy_goal_id: int | None


class MilestoneCreate(BaseModel):
    outcome_id: int
    title: str
    month: int
    year: int


class MilestoneEdit(BaseModel):
    title: str | None = None
    status: str | None = None
    outcome_id: int | None = None  # re-parent fix-up


class MilestoneOut(BaseModel):
    id: int
    outcome_id: int
    title: str
    month: int
    year: int
    status: str
    fixed: bool
    progress: int
    legacy_goal_id: int | None


class WinCreate(BaseModel):
    milestone_id: int
    title: str
    week_start_date: str
    criteria: str = ""


class WinEdit(BaseModel):
    title: str | None = None
    criteria: str | None = None
    status: str | None = None
    milestone_id: int | None = None  # re-parent fix-up


class WinOut(BaseModel):
    id: int
    milestone_id: int
    title: str
    week_start_date: str
    criteria: str
    status: str
    fixed: bool
    progress: int
    legacy_goal_id: int | None


class PlanTaskCreate(BaseModel):
    title: str
    win_id: int | None = None
    scheduled_date: str | None = None


class PlanTaskEdit(BaseModel):
    title: str | None = None
    status: str | None = None


class PlanTaskOut(BaseModel):
    id: int
    win_id: int | None
    title: str
    scheduled_date: str | None
    status: str
    owner_key: GoalOwnerKeyT


class ScheduleSet(BaseModel):
    scheduled_date: str | None
    win_id: int | None


CarryForwardActionT = Literal["nextweek", "date", "backlog", "drop"]


class CarryForwardAction(BaseModel):
    action: CarryForwardActionT


class ChecklistItemCreate(BaseModel):
    text: str
    outcome_id: int | None = None
    milestone_id: int | None = None
    win_id: int | None = None


class ChecklistItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    pid: str
    outcome_id: int | None
    milestone_id: int | None
    win_id: int | None
    text: str
    done: bool
    added_date: str


# ── Individual Task Board (Goal -> Task -> that Task's own kanban) ───
# Superseded design note: this used to be a flat per-project board with
# an optional goal_id backlink on each card (see the dropped
# `48d822248fb2` migration's BoardCardCreate/Out). The user corrected
# the shape to a 3-level hierarchy — Goal -> Task (1..N) -> that Task's
# own QUEUED/FOCUS/CLOSED board — so cards are now scoped to a Task,
# and there's a new Task tier in between with its own schemas.
BoardColT = Literal["todo", "focus", "done"]
BoardPriorityT = Literal["low", "normal", "high"]


class BoardTaskCreate(BaseModel):
    title: str


class BoardTaskEdit(BaseModel):
    title: str | None = None
    outcome: str | None = None
    next_action: str | None = None


class BoardTaskOut(BaseModel):
    id: int
    goal_id: int
    title: str
    outcome: str
    next_action: str


class BoardCardCreate(BaseModel):
    col: BoardColT
    title: str
    note: str = ""
    priority: BoardPriorityT = "normal"


class BoardCardEdit(BaseModel):
    title: str | None = None
    note: str | None = None
    # Added 2026-09-16: priority previously could only be SET at card
    # creation (BoardCardCreate) — no way to change it afterwards, the
    # collapsed tile's priority pill wasn't even a button. Zahid asked
    # for click-to-cycle on that pill; this field is what lets the
    # cycled value persist.
    priority: BoardPriorityT | None = None


class BoardCardMove(BaseModel):
    col: BoardColT


class BoardCardOut(BaseModel):
    id: int
    task_id: int
    col: BoardColT
    title: str
    note: str
    priority: BoardPriorityT
    pinned: bool
    secs: float
    sessions: list


ThemeT = Literal["focus", "warroom", "energy", "corporate", "journey", "rize"]
LangT = Literal["en", "bn"]
PanelLayoutT = Literal["full", "partial", "compact"]
FocusTabT = Literal["hours", "mit", "list", "notes"]


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
    panel_layout: PanelLayoutT
    focus_tab: FocusTabT


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
    panel_layout: PanelLayoutT | None = None
    focus_tab: FocusTabT | None = None


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


BdpStatusT = Literal["IDEA", "OPPORTUNITY", "RESEARCH", "PLAN", "ACTIVE", "HOLD", "DONE"]
BdpPriorityT = Literal["HIGH", "MEDIUM", "LOW"]
BdpMoveDirectionT = Literal[-1, 1]


class BdpActionOut(BaseModel):
    id: int
    text: str
    done: bool


class BdpPlanOut(BaseModel):
    id: int
    title: str
    status: BdpStatusT
    priority: BdpPriorityT
    opportunity: str
    market: str
    target: str
    niche: str
    model: str
    product: str
    service: str
    supplier: str
    timeline: str
    potential: int
    difficulty: int
    cost_amount: str
    yearly_profit: str
    notes: str
    archived: bool
    created: str
    updated: str
    order: float
    next_actions: list[BdpActionOut]


class BdpPlanCreate(BaseModel):
    title: str
    status: BdpStatusT | None = None
    priority: BdpPriorityT | None = None
    opportunity: str | None = None
    market: str | None = None
    target: str | None = None
    niche: str | None = None
    model: str | None = None
    product: str | None = None
    service: str | None = None
    supplier: str | None = None
    timeline: str | None = None
    potential: int | None = None
    difficulty: int | None = None
    cost_amount: str | None = None
    yearly_profit: str | None = None
    notes: str | None = None


class BdpPlanEdit(BaseModel):
    """All-optional — PUT /api/bdp/plans/{id} patches only fields sent."""

    title: str | None = None
    status: BdpStatusT | None = None
    priority: BdpPriorityT | None = None
    opportunity: str | None = None
    market: str | None = None
    target: str | None = None
    niche: str | None = None
    model: str | None = None
    product: str | None = None
    service: str | None = None
    supplier: str | None = None
    timeline: str | None = None
    potential: int | None = None
    difficulty: int | None = None
    cost_amount: str | None = None
    yearly_profit: str | None = None
    notes: str | None = None


class BdpMove(BaseModel):
    direction: BdpMoveDirectionT


class BdpActionCreate(BaseModel):
    text: str


class BdpActionEdit(BaseModel):
    text: str


class TimerRestore(BaseModel):
    secs: float
    sessions: list


class BdpReorder(BaseModel):
    to_index: int


class BdpSortSet(BaseModel):
    sort: Literal["manual", "priority"]


class BdpSortOut(BaseModel):
    sort: Literal["manual", "priority"]


class BdpViewSet(BaseModel):
    view: Literal["card", "table", "list"]


class BdpViewOut(BaseModel):
    view: Literal["card", "table", "list"]


Q90AreaKeyT = Literal["appearance", "money", "relationship", "health", "social", "mind"]
# V2 "112-Day Transformation Board" — the 7 free-text fields settable
# through the generic field-set endpoint. `achieved`, `major_changes`
# and destination changes each have their own dedicated endpoint below
# since they aren't plain text writes. See engine/quarterly.py.
Q90FieldT = Literal[
    "current_reality",
    "destination",
    "proof",
    "gap",
    "weekly_lead_behavior",
    "obstacle_if",
    "response_then",
]
Q90StatusT = Literal["not_started", "defined", "planned", "active", "proven"]


class Q90MajorChangeOut(BaseModel):
    id: int
    text: str
    done: bool = False


class Q90GoalHistoryEntryOut(BaseModel):
    destination: str
    reason: str
    evidence: str
    changed_at: str


class Q90AreaOut(BaseModel):
    key: Q90AreaKeyT
    label: str
    glyph: str
    description: str
    current_reality: str
    destination: str
    proof: str
    achieved: bool
    gap: str
    major_changes: list[Q90MajorChangeOut]
    weekly_lead_behavior: str
    obstacle_if: str
    response_then: str
    goal_version: int
    goal_history: list[Q90GoalHistoryEntryOut]
    status: Q90StatusT


class Q90PanelOut(BaseModel):
    cycle_start: str
    cycle_end: str
    cycle_days: int
    day: int
    days_left: int
    areas_done: int
    areas_total: int
    areas: list[Q90AreaOut]


class Q90FieldSet(BaseModel):
    area: Q90AreaKeyT
    field: Q90FieldT
    text: str


class Q90AchievedSet(BaseModel):
    area: Q90AreaKeyT
    achieved: bool


class Q90MajorChangeIn(BaseModel):
    # id is optional here — a newly-added row from the frontend has none
    # yet; engine.quarterly.set_major_changes auto-assigns one.
    id: int | None = None
    text: str
    done: bool = False


class Q90MajorChangesSet(BaseModel):
    area: Q90AreaKeyT
    changes: list[Q90MajorChangeIn]


class Q90DestinationChange(BaseModel):
    area: Q90AreaKeyT
    new_destination: str
    reason: str = ""
    evidence: str = ""


class Q90StrategyReset(BaseModel):
    area: Q90AreaKeyT


class Q90AreaMetaSet(BaseModel):
    area: Q90AreaKeyT
    field: Literal["label", "description"]
    text: str


class Q90AreaReorder(BaseModel):
    order: list[Q90AreaKeyT]


class Q90CycleSet(BaseModel):
    start: str  # ISO date
    days: int


class HourSlotOut(BaseModel):
    # The row's own id. A task started from an hour carries it back
    # (Task.hour_slot_id), and the MIT list needs the pair to say WHICH
    # hour a task came from — otherwise a row that appeared because you
    # pressed play on 09:00 looks like the list grew a task by itself.
    id: int | None = None
    hour: int
    text: str
    done: bool
    # True when this entry carries forward to tomorrow if unfinished.
    repeat: bool = False


class HourSlotSet(BaseModel):
    # Both optional and independent: ticking must not blank the text, and
    # typing must not un-tick. Sending neither is a no-op rather than an
    # error, so a debounced save that fires with nothing to say is safe.
    text: str | None = None
    done: bool | None = None
    repeat: bool | None = None


class HourBlockOut(BaseModel):
    key: str
    name: str
    hours: list[HourSlotOut]
    done: int
    planned: int


class HourPlanOut(BaseModel):
    day: str
    current_block: str
    total_done: int
    total_planned: int
    blocks: list[HourBlockOut]


# ── Morning Ritual ────────────────────────────────────────────────────
# Rebuilt 2026-09-15 to match Zahid's fuller "Morning Activation"
# brainstorm prototype — see database/models.py's MorningRitual
# docstring and engine/morning_ritual.py's module docstring for the
# full scoping history. This is not a step wizard; every section below
# is its own independent read/write.
class MorningRitualOut(BaseModel):
    day: str
    today_outcome: str
    first_move: str
    carried_from_date: str | None
    energy: str | None
    mood: str | None
    sleep_quality: str | None
    wake_up_time: str | None
    morning_mode: str
    reset_breathe: bool
    reset_move: bool
    reset_daylight: bool
    reset_water: bool
    journal_text: str
    journal_action_needed: bool | None
    journal_released: bool
    prime_meditation: bool
    prime_visualization: bool
    prime_reading: bool
    prime_gratitude: str
    prime_intention: str | None
    prime_spiritual: str
    completed: bool
    started_at: float | None
    started_first_action_at: float | None
    completed_at: float | None
    kpi_seconds: float | None


class MorningRitualOutcomeSet(BaseModel):
    text: str


class MorningRitualFirstMoveSet(BaseModel):
    text: str


class MorningRitualCheckIn(BaseModel):
    energy: str | None = None
    mood: str | None = None
    sleep_quality: str | None = None
    wake_up_time: str | None = None


class MorningRitualToggle(BaseModel):
    done: bool


class MorningRitualJournalSet(BaseModel):
    text: str


class MorningRitualJournalAction(BaseModel):
    needed: bool


class MorningRitualSuggestIn(BaseModel):
    text: str


class MorningRitualSuggestOut(BaseModel):
    suggestion: str


class MorningRitualGratitudeSet(BaseModel):
    text: str


class MorningRitualIntentionSet(BaseModel):
    value: str | None


class MorningRitualSpiritualSet(BaseModel):
    value: str


class MorningRitualTrendOut(BaseModel):
    year: int
    month: int
    days: list[str]
    completed: list[bool]
    energy: list[str | None]
    mood: list[str | None]
    sleep_quality: list[str | None]
    morning_mode: list[str | None]
    streak: int
    journal: list[MindsetHistoryEntry]
    wake_up_time: list[MindsetHistoryEntry]


# ── Night Closure ─────────────────────────────────────────────────────
# Evening counterpart to Morning Ritual above — see database/models.py's
# NightClosure docstring and engine/night_closure.py's module docstring.
class NightClosureOut(BaseModel):
    day: str
    where_stopped: str
    unfinished: str
    tomorrow_outcome: str
    tomorrow_first_action: str
    optional_blocker: str
    optional_note: str
    close_time: str | None
    closed_at: float | None


class NightClosureNight(BaseModel):
    day: str
    closed: bool
    written: int


class NightClosureTextSet(BaseModel):
    text: str


class NightClosureTimeSet(BaseModel):
    value: str


# ── Daily Do's / Don'ts ──────────────────────────────────────────────
# Standing daily commitments shown in Morning Ritual — see
# database/models.py's HabitItem docstring and engine/habits.py's
# module docstring.
HabitKindT = Literal["do", "dont"]
HabitPriorityT = Literal["low", "normal", "high"]


class HabitItemOut(BaseModel):
    id: int
    kind: HabitKindT
    name: str
    time: str
    priority: HabitPriorityT
    tracking_basis: str
    sort_order: int
    done_today: bool
    streak: int


class HabitCreate(BaseModel):
    kind: HabitKindT
    name: str
    time: str = ""
    priority: HabitPriorityT = "normal"
    tracking_basis: str = ""


class HabitEdit(BaseModel):
    name: str | None = None
    time: str | None = None
    priority: HabitPriorityT | None = None
    tracking_basis: str | None = None


class HabitCheckin(BaseModel):
    date: str  # ISO date
    done: bool


class HabitReorder(BaseModel):
    ids: list[int]


# Global quick-capture notes (EXECUTE's NOTES tab) — see Note's own
# docstring in database/models.py for why there's no title field here
# either; NoteOut's `title` is derived server-side, not stored.
class NoteCreate(BaseModel):
    body: str = ""


class NoteEdit(BaseModel):
    body: str | None = None
    pinned: bool | None = None


class NoteOut(BaseModel):
    id: int
    title: str
    body: str
    pinned: bool
    created_at: float
    updated_at: float
