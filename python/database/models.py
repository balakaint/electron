from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Task(Base):
    __tablename__ = "tasks"

    # Matches the legacy app's int(time.time() * 1000) ids, so existing
    # tasks can be imported without remapping any id references (psrc,
    # timers, etc).
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    list_key: Mapped[str] = mapped_column(String, default="classic")  # 'classic' | 'focus'
    text: Mapped[str] = mapped_column(String)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    secs: Mapped[float] = mapped_column(Float, default=0.0)
    sessions: Mapped[list] = mapped_column(JSON, default=list)  # [{"start": ts, "end": ts|null}]
    est: Mapped[int] = mapped_column(Integer, default=0)  # time-box minutes, 0 = none
    mit: Mapped[bool] = mapped_column(Boolean, default=False)
    day: Mapped[str] = mapped_column(String)  # ISO date string
    urgency: Mapped[str] = mapped_column(String, default="med")  # low | med | high
    strike: Mapped[bool] = mapped_column(Boolean, default=False)
    project: Mapped[str | None] = mapped_column(ForeignKey("projects.key"), nullable=True)
    psrc: Mapped[str | None] = mapped_column(ForeignKey("project_subtasks.pid"), nullable=True)


HABIT_CATEGORIES = ("money", "health", "relation", "mind")


class Habit(Base):
    __tablename__ = "habits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String)  # money | health | relation | mind
    name: Mapped[str] = mapped_column(String)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # Soft-delete rather than a hard DELETE: dropping a habit shouldn't
    # erase its recorded history, and the id-based FK on HabitCompletion
    # only helps with that if the row stays put.
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class HabitCompletion(Base):
    __tablename__ = "habit_completions"
    __table_args__ = (UniqueConstraint("habit_id", "day", name="uq_habit_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id"))
    day: Mapped[str] = mapped_column(String)  # ISO date string
    done: Mapped[bool] = mapped_column(Boolean, default=False)


class DailyIntention(Base):
    __tablename__ = "daily_intentions"

    day: Mapped[str] = mapped_column(String, primary_key=True)  # ISO date string
    text: Mapped[str] = mapped_column(String, default="")


PROJECT_KEYS = ("proj1", "proj2", "proj3", "proj4", "proj5", "proj6")


class Project(Base):
    __tablename__ = "projects"

    key: Mapped[str] = mapped_column(String, primary_key=True)  # proj1..proj6
    name: Mapped[str] = mapped_column(String)
    accent_color: Mapped[str] = mapped_column(String)
    note: Mapped[str] = mapped_column(String, default="")
    detail_note: Mapped[str] = mapped_column(String, default="")
    note_bg: Mapped[str | None] = mapped_column(String, nullable=True)
    note_fg: Mapped[str | None] = mapped_column(String, nullable=True)
    target_minutes: Mapped[int] = mapped_column(Integer, default=60)
    # Unix timestamp of when the ▶ timer was last started; NULL = stopped.
    # Elapsed time is credited to *today* on stop, matching the legacy
    # _proj_add_secs, which always wrote into str(date.today())'s bucket
    # regardless of when the session began.
    running_since: Mapped[float | None] = mapped_column(Float, nullable=True)


class ProjectSubtask(Base):
    __tablename__ = "project_subtasks"

    # Preserves the legacy "proj1:<ms>:<idx>" string id as-is, so existing
    # Task.psrc values already pointing at one resolve with zero remapping.
    pid: Mapped[str] = mapped_column(String, primary_key=True)
    project_key: Mapped[str] = mapped_column(ForeignKey("projects.key"))
    text: Mapped[str] = mapped_column(String)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    added_date: Mapped[str] = mapped_column(String)  # ISO date string


class ProjectActivity(Base):
    """One row per (project, day) — merges the legacy __ptime_<key> timer
    log and __consist_mark_<key> manual override, which were always keyed
    by the same (project, day) pair anyway."""

    __tablename__ = "project_activity"
    __table_args__ = (UniqueConstraint("project_key", "day", name="uq_project_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_key: Mapped[str] = mapped_column(ForeignKey("projects.key"))
    day: Mapped[str] = mapped_column(String)  # ISO date string
    secs: Mapped[float] = mapped_column(Float, default=0.0)
    manual_mark: Mapped[bool] = mapped_column(Boolean, default=False)


class CirclePerson(Base):
    __tablename__ = "circle_people"

    # Legacy ms-timestamp id preserved (matches Task/Habit id conventions).
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    project_key: Mapped[str | None] = mapped_column(ForeignKey("projects.key"), nullable=True)
    name: Mapped[str] = mapped_column(String)
    cadence_days: Mapped[int] = mapped_column(Integer, default=7)
    last_contact: Mapped[str | None] = mapped_column(String, nullable=True)  # ISO date string


DECISION_STATUSES = ("", "GO", "VALIDATE", "PIVOT", "NO-GO")
NEXT_PRIORITIES = ("", "HIGH", "MED", "LOW")


class BusinessAnalysis(Base):
    """One row per project (1:1) — the CURRENT 5-section BA canvas
    (ba_idea_*/ba_an_*/ba_fin_*/ba_decision_*/ba_next_* in the legacy
    app). Superseded an older single-blob version (ba_idea/ba_analysis/
    ba_financial/ba_decision) which the legacy app already auto-migrated
    forward — nothing left to carry from that generation. The even-older
    15-box freeform grid (ba_box_0..14) is a separate, read-only archive:
    see LegacyAnalysisBox."""

    __tablename__ = "business_analysis"

    project_key: Mapped[str] = mapped_column(ForeignKey("projects.key"), primary_key=True)
    idea_business: Mapped[str] = mapped_column(String, default="")
    idea_problem: Mapped[str] = mapped_column(String, default="")
    idea_customer: Mapped[str] = mapped_column(String, default="")
    idea_goal: Mapped[str] = mapped_column(String, default="")
    an_market: Mapped[str] = mapped_column(String, default="")
    an_competition: Mapped[str] = mapped_column(String, default="")
    an_strength: Mapped[str] = mapped_column(String, default="")
    an_risk: Mapped[str] = mapped_column(String, default="")
    fin_investment: Mapped[str] = mapped_column(String, default="")
    fin_cost: Mapped[str] = mapped_column(String, default="")
    fin_revenue: Mapped[str] = mapped_column(String, default="")
    fin_profit: Mapped[str] = mapped_column(String, default="")
    decision_why: Mapped[str] = mapped_column(String, default="")
    decision_status: Mapped[str] = mapped_column(String, default="")  # GO|VALIDATE|PIVOT|NO-GO|""
    next_action: Mapped[str] = mapped_column(String, default="")
    next_priority: Mapped[str] = mapped_column(String, default="")  # HIGH|MED|LOW|""
    next_deadline: Mapped[str] = mapped_column(String, default="")  # free text, not a real date


class DecisionLog(Base):
    """Append-only history of decision_status changes — the log itself
    is the point (matches the legacy app's own comment: "GO in July,
    PIVOT in September is the story of the business"). `why` is a
    snapshot of decision_why at the moment of the change, captured
    automatically rather than asked for again."""

    __tablename__ = "decision_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_key: Mapped[str] = mapped_column(ForeignKey("projects.key"))
    date: Mapped[str] = mapped_column(String)  # ISO date string
    from_status: Mapped[str] = mapped_column(String)
    to_status: Mapped[str] = mapped_column(String)
    why: Mapped[str] = mapped_column(String, default="")


GOAL_HORIZONS = ("yearly", "monthly", "weekly")


class Goal(Base):
    """One row per goal. Legacy kept these as three per-project lists
    (self.yearly/.monthly/.weekly, rebound to whichever project's entry
    in _goals_by_project was selected) — flattened here to one table
    with a `horizon` column, matching how Task's list_key already
    replaces a similar split. Legacy's per-goal `day` field (day_number
    of the APP's start_date, not the goal's) is dropped: nothing ever
    read it back, it was write-only dead weight. The "N/30" progress
    bar legacy drew from start_date is a pure display computation, not
    stored state — the API/UI layer derives it from start_date same as
    legacy did, no column needed for it."""

    __tablename__ = "goals"

    # ms-timestamp id, matching Task/CirclePerson's convention.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    project_key: Mapped[str] = mapped_column(ForeignKey("projects.key"))
    horizon: Mapped[str] = mapped_column(String)  # yearly | monthly | weekly
    text: Mapped[str] = mapped_column(String)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    start_date: Mapped[str] = mapped_column(String)  # ISO date string
    done_date: Mapped[str | None] = mapped_column(String, nullable=True)  # ISO date string
    note: Mapped[str] = mapped_column(String, default="")


class AppState(Base):
    """Singleton row (id is always 1) for small pieces of global state
    that don't belong to any one entity. This is also the port's
    "settings table" — the legacy app's single `self._settings` dict
    plays the same role — grown incrementally as each cross-cutting
    setting needed a home rather than introduced as a separate concept
    each time:
    - last_strike_reset_day: the port has no live day-rollover tick like
      the legacy app, so this is what lets the daily strike reset be
      applied lazily (checked on read/write of strike, and every
      periodic timer-reconciliation tick) instead of needing a cron.
    - task_day_view: which day the Tasks lists are currently showing
      ("today" | "tomorrow") — a single global toggle shared by both
      Plan and Focus, matching the legacy app's `self._task_day`.
    - theme: the active UI theme key (matches the legacy app's
      `self._settings["theme"]`).
    - onboarded: whether the first-run onboarding tour has been
      completed (matches the legacy app's `self._onboarded`).
    - goal_project: which project's goals the Goals panel is currently
      showing (matches the legacy app's `self._goal_project`) — a
      single global pointer, not per-project state itself.
    - sec_title_yearly/monthly/weekly: user-renamed Goals section
      headings (legacy's `vision_data["_sec_title_<horizon>"]`, which
      lived in a global dict despite goals themselves being
      per-project — same split preserved here). NULL/empty falls back
      to the default label ("YEARLY"/"MONTHLY"/"WEEKLY") client-side,
      same as legacy's own fallback.
    - now_task_id: explicit override for which task the NOW panel
      points at (legacy's `self._now_id`). This is a POINTER, not the
      source of truth — legacy's own `_now_task()` only trusts it while
      the pointed-to task is still `strike=True` and `done=False`;
      otherwise NOW re-derives to "the first unfinished struck task".
      Deliberately NOT re-validated here in the model layer (that
      derive-or-fall-back logic belongs to the NOW engine, same as
      legacy keeps it out of the data layer) — this column may point at
      a task that no longer qualifies, and that is the intended,
      self-healing steady state, not a bug to prevent. The FK exists so
      deleting that task can't leave a dangling reference; see
      TaskRepository.delete()'s clearing of this field, mirroring how
      ProjectSubtask deletion already un-links Task.psrc.
    - lang/analog_clock/auto_timer_on_open/idle_stop_min/
      phase_morning_start/phase_work_start/phase_evening_start/
      phase_sleep_start/goal_hours/currency/start_with_windows: the
      legacy Settings dialog's remaining controls (`_show_settings`),
      added together as one slice rather than fixed columns bolted on
      one at a time — same flat-columns-on-the-singleton-row shape as
      everything above, not a separate key-value table, so this stays
      the one place any cross-cutting setting lives. idle_stop_min is
      read by engine.timer_reconciliation (default 15, matching that
      module's own IDLE_LIMIT_SECS fallback for callers with no repo in
      hand). start_with_windows is stored here as a plain preference
      only — actually registering/unregistering the OS startup entry is
      Electron-main-process territory and isn't wired yet."""

    __tablename__ = "app_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    last_strike_reset_day: Mapped[str | None] = mapped_column(String, nullable=True)
    task_day_view: Mapped[str] = mapped_column(String, default="today")
    theme: Mapped[str] = mapped_column(String, default="focus")
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    goal_project: Mapped[str] = mapped_column(String, default="proj1")
    sec_title_yearly: Mapped[str | None] = mapped_column(String, nullable=True)
    sec_title_monthly: Mapped[str | None] = mapped_column(String, nullable=True)
    sec_title_weekly: Mapped[str | None] = mapped_column(String, nullable=True)
    now_task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    lang: Mapped[str] = mapped_column(String, default="en")
    analog_clock: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_timer_on_open: Mapped[bool] = mapped_column(Boolean, default=True)
    idle_stop_min: Mapped[int] = mapped_column(Integer, default=15)
    phase_morning_start: Mapped[int] = mapped_column(Integer, default=5)
    phase_work_start: Mapped[int] = mapped_column(Integer, default=9)
    phase_evening_start: Mapped[int] = mapped_column(Integer, default=18)
    phase_sleep_start: Mapped[int] = mapped_column(Integer, default=23)
    goal_hours: Mapped[int] = mapped_column(Integer, default=5)
    currency: Mapped[str] = mapped_column(String, default="$")
    start_with_windows: Mapped[bool] = mapped_column(Boolean, default=False)


class LegacyAnalysisBox(Base):
    """Read-only archive of the 15-box freeform grid (ba_box_0..14 +
    titles) the legacy app itself stopped showing after a UI redesign
    but deliberately never deleted. Not editable in the new UI either —
    same preservation choice the original developer already made."""

    __tablename__ = "legacy_analysis_boxes"
    __table_args__ = (UniqueConstraint("project_key", "box_index", name="uq_project_box"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_key: Mapped[str] = mapped_column(ForeignKey("projects.key"))
    box_index: Mapped[int] = mapped_column(Integer)  # 0-14
    title: Mapped[str] = mapped_column(String, default="")
    text: Mapped[str] = mapped_column(String, default="")


# Default (name, description) per stage — matches the legacy app's
# _JOURNEY_STAGES exactly (descriptions translated from the original
# Bangla; the port has no language picker yet, see FEATURE_INVENTORY.md
# row 17). Both are stored per-project in JourneyStage and are user-
# renamable there — this tuple is only the seed value new rows start
# from, not a fixed enum.
JOURNEY_STAGES = (
    ("Product Research", "Find the problem and the opportunity"),
    ("Sales Channel Development", "Website / landing page"),
    ("Search Engine Optimization", "Product content / creative"),
    ("Viral Content", "Optimize and prepare"),
    ("Customer Acquisition", "Bring visitors and customers"),
    ("Sales and Feedback", "Revenue, launch, and growth"),
)


class ProjectJourney(Base):
    """One row per project (1:1) — the Journey page's own editable
    identity, deliberately separate from Project.name/note. Legacy
    seeds `proj_name` from the project's title on first open but then
    lets it diverge — the Journey page's header and the dashboard card
    are allowed to say different things, same as legacy."""

    __tablename__ = "project_journey"

    project_key: Mapped[str] = mapped_column(ForeignKey("projects.key"), primary_key=True)
    proj_name: Mapped[str] = mapped_column(String, default="")
    tagline: Mapped[str] = mapped_column(String, default="Product Idea → Launch")
    # Absolute filesystem paths, not embedded blobs — matches legacy
    # exactly ("launch, don't embed": the cover image is displayed by
    # reading the path, the attached file is handed to the OS's default
    # app). Valid only because this is a single-user desktop app running
    # on the same machine that picked the file, same assumption legacy
    # already made.
    cover_image: Mapped[str] = mapped_column(String, default="")
    attach_file: Mapped[str] = mapped_column(String, default="")


class JourneyStage(Base):
    """One row per (project, stage 0-5) — name/description (both
    renamable), and the exit gate. Current-stage and stage-done are
    deliberately NOT columns here: legacy stores+recomputes `stage`
    defensively ("correct any stage saved by an older logic"), but the
    rule is fully determined by this row's gate plus JourneyTask rows,
    so the port just recomputes it live on every read instead of
    risking the two ever disagreeing — same choice already made for
    NOW's pointer (see engine.now)."""

    __tablename__ = "journey_stages"
    __table_args__ = (UniqueConstraint("project_key", "stage_index", name="uq_project_stage"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_key: Mapped[str] = mapped_column(ForeignKey("projects.key"))
    stage_index: Mapped[int] = mapped_column(Integer)  # 0-5
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String, default="")
    # "This stage is over when…" — an outside-world condition, not a
    # task. Empty means "not written yet", which is what makes the
    # gate-vs-all-tasks-done rule backward compatible: a stage behaves
    # exactly like plain task-completion until its owner writes one.
    gate: Mapped[str] = mapped_column(String, default="")
    gate_done: Mapped[bool] = mapped_column(Boolean, default=False)


class JourneyTask(Base):
    """A stage's always-visible task list. Matches Task's ms-timestamp
    id convention, but deliberately its own table rather than a row in
    the main `tasks` table — a Journey task has no timer, no urgency, no
    strike, none of Task's other columns; forcing it into that table
    would mean either nullable columns that make no sense here or a
    shared row shape that's meaningful for neither use."""

    __tablename__ = "journey_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    project_key: Mapped[str] = mapped_column(ForeignKey("projects.key"))
    stage_index: Mapped[int] = mapped_column(Integer)  # 0-5
    text: Mapped[str] = mapped_column(String)
    done: Mapped[bool] = mapped_column(Boolean, default=False)


class JourneyLogEntry(Base):
    """A stage's dated "what I found out" record — matches legacy's
    `logs` entries exactly (`{"t", "d", "s"}`). `status` is "" (info,
    the default) | "ok" (worked) | "no" (didn't work), cycled in that
    order. Read newest-first at the query layer (matches legacy's
    insert-at-0) — this table itself just needs the ms-timestamp id to
    make that ordering possible without a separate sort column."""

    __tablename__ = "journey_log_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    project_key: Mapped[str] = mapped_column(ForeignKey("projects.key"))
    stage_index: Mapped[int] = mapped_column(Integer)  # 0-5
    text: Mapped[str] = mapped_column(String)
    date: Mapped[str] = mapped_column(String)  # ISO date string
    status: Mapped[str] = mapped_column(String, default="")  # "" | "ok" | "no"
