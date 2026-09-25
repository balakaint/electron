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
    # The goal-task twin of psrc, set the same way by NowEngine.strike_goal_task
    # when "+ STRIKE" promotes a Goal's own checklist item instead of a
    # project subtask — see GoalTask's own docstring.
    gsrc: Mapped[str | None] = mapped_column(ForeignKey("goal_tasks.pid"), nullable=True)
    # The hour-plan row this task was started from, if it was.
    #
    # A task can reach the Focus list two ways now. "+ STRIKE" promotes a
    # project subtask and sets `psrc`; pressing play on an hour you wrote
    # promotes THAT and sets this. Both are the same idea — the thing you
    # planned somewhere else, now being worked on — and both need the
    # link for the same reason: finishing it here has to tick it there,
    # or the plan and the work drift apart within a day.
    hour_slot_id: Mapped[int | None] = mapped_column(ForeignKey("hour_slots.id"), nullable=True)
    # Local date (YYYY-MM-DD) the task was last marked done; None while
    # open. TASK LIST's Done filter shows the last 7 days by it. Tasks
    # finished before this column existed fall back to their `day`.
    done_at: Mapped[str | None] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class DailyIntention(Base):
    """One row per day of free-text journaling.

    Originally grown to hold all four of legacy's per-day `_habit_data`
    text keys (intention/win/reflection/mindset). The `text` (intention)
    and `win`/`reflection` columns are now DEAD — their only UI was the
    "Life Execution Board" (Habit checklist + these three fields), which
    Zahid removed outright (2026-09-14: "emon task list mainly regular
    chek kora hoy na" — not actually checked regularly). Left as unused
    columns rather than dropped, so any of his own historical entries
    already in `app.db` are not destroyed by a migration he didn't ask
    for; only `mindset` (a separate feature, PlanReview.tsx's own
    Mindset tab) is still read/written. See also: the `habits` /
    `habit_completions` tables this same removal dropped entirely
    (migration `<pending>`, see database/models.py history), since those
    held no data Zahid asked to keep.

    `mindset` was kept under its own key even before `text`/`win`/
    `reflection` went dead: legacy stored these under separate keys and
    showed them on separate surfaces, and merging them would have
    silently overwritten one with the other on import.
    """

    __tablename__ = "daily_intentions"

    day: Mapped[str] = mapped_column(String, primary_key=True)  # ISO date string
    text: Mapped[str] = mapped_column(String, default="")
    win: Mapped[str] = mapped_column(String, default="")
    reflection: Mapped[str] = mapped_column(String, default="")
    mindset: Mapped[str] = mapped_column(String, default="")
    design_today: Mapped[str] = mapped_column(String, default="")


PROJECT_KEYS = ("proj1", "proj2", "proj3", "proj4", "proj5", "proj6")


class Project(Base):
    __tablename__ = "projects"

    key: Mapped[str] = mapped_column(String, primary_key=True)  # proj1..proj6
    name: Mapped[str] = mapped_column(String)
    accent_color: Mapped[str] = mapped_column(String)
    note: Mapped[str] = mapped_column(String, default="")
    detail_note: Mapped[str] = mapped_column(String, default="")
    # Legacy's `_qn_title_<projkey>`: the Quick Notes heading is
    # renameable per project, and legacy goes out of its way to
    # preserve those renames on save (580-587). Empty means "use the
    # default heading" rather than "blank heading".
    note_title: Mapped[str] = mapped_column(String, default="")
    note_bg: Mapped[str | None] = mapped_column(String, nullable=True)
    note_fg: Mapped[str | None] = mapped_column(String, nullable=True)
    # User-renamed Goals section headings for THIS project (moved off
    # AppState 2026-09-19 — see that model's own comment). NULL/empty
    # falls back to the default label ("YEARLY"/"MONTHLY"/"WEEKLY")
    # client-side, same convention as note_title above.
    sec_title_yearly: Mapped[str | None] = mapped_column(String, nullable=True)
    sec_title_monthly: Mapped[str | None] = mapped_column(String, nullable=True)
    sec_title_weekly: Mapped[str | None] = mapped_column(String, nullable=True)
    target_minutes: Mapped[int] = mapped_column(Integer, default=60)
    # Unix timestamp of when the ▶ timer was last started; NULL = stopped.
    # Elapsed time is credited to *today* on stop, matching the legacy
    # _proj_add_secs, which always wrote into str(date.today())'s bucket
    # regardless of when the session began.
    running_since: Mapped[float | None] = mapped_column(Float, nullable=True)
    collapsed: Mapped[bool] = mapped_column(Boolean, default=False)


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
    see LegacyAnalysisBox.

    DECISION section redesigned 2026-09-15 (Zahid): the GO/VALIDATE/
    PIVOT/NO-GO chip row + "why this decision?" + change history was
    replaced on the canvas by four Feelings/Thoughts/Beliefs/Actions
    blocks, each asking for the current negative state linked to the
    goal and the positive state needed to succeed — his own explicit
    choice over keeping the GO/NO-GO chips alongside the new blocks
    (`AskUserQuestion`: "সম্পূর্ণ বাদ, Feelings/Thoughts/Beliefs/Actions
    দিয়ে replace"). `decision_why`/`decision_status` and the DecisionLog
    table are deliberately NOT dropped — same judgment call as
    DailyIntention's unused `.text`/`.win`/`.reflection` columns
    elsewhere in this file: nobody asked for that data destroyed, only
    for the canvas to stop showing it, so the columns/table stay,
    unused by the UI. Migration `b81a2c8dad9b` added the 8 new
    columns."""

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
    decision_why: Mapped[str] = mapped_column(String, default="")  # kept, unused by the canvas — see class docstring
    decision_status: Mapped[str] = mapped_column(String, default="")  # GO|VALIDATE|PIVOT|NO-GO|"" — kept, unused by the canvas
    # ── DECISION redesign: Feelings / Thoughts / Beliefs / Actions ──
    feelings_negative: Mapped[str] = mapped_column(String, default="")
    feelings_positive: Mapped[str] = mapped_column(String, default="")
    thoughts_negative: Mapped[str] = mapped_column(String, default="")
    thoughts_positive: Mapped[str] = mapped_column(String, default="")
    beliefs_negative: Mapped[str] = mapped_column(String, default="")
    beliefs_positive: Mapped[str] = mapped_column(String, default="")
    actions_negative: Mapped[str] = mapped_column(String, default="")
    actions_positive: Mapped[str] = mapped_column(String, default="")
    next_action: Mapped[str] = mapped_column(String, default="")
    next_priority: Mapped[str] = mapped_column(String, default="")  # HIGH|MED|LOW|""
    next_deadline: Mapped[str] = mapped_column(String, default="")  # free text, not a real date
    next_who: Mapped[str] = mapped_column(String, default="")
    next_when: Mapped[str] = mapped_column(String, default="")
    next_time: Mapped[str] = mapped_column(String, default="")  # free text duration estimate, e.g. "60 min"
    next_done_when: Mapped[str] = mapped_column(String, default="")
    attach_path: Mapped[str] = mapped_column(String, default="")  # local path to a supporting Word/Excel/CSV file


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
    # No FK to projects.key (dropped by migration `26f6de8766a5`, see that
    # migration's own docstring) — "life" is a reserved project_key that
    # owns its own weekly/monthly/yearly goals exactly like a real
    # project, but has no row in `projects` (a real row there would show
    # up in panel 1's fixed 6-slot roster, today's totals, the trend
    # chart, etc — ProjectRepository.list() has no filter for "not a
    # real project"). The FK was the only thing stopping "life" from
    # being just another string here; GoalEngine itself never looked the
    # project up. GoalOwnerKeyT (api/schemas.py) is what still constrains
    # this column's legal values at the API boundary.
    project_key: Mapped[str] = mapped_column(String)
    horizon: Mapped[str] = mapped_column(String)  # yearly | monthly | weekly
    text: Mapped[str] = mapped_column(String)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    start_date: Mapped[str] = mapped_column(String)  # ISO date string
    done_date: Mapped[str | None] = mapped_column(String, nullable=True)  # ISO date string
    note: Mapped[str] = mapped_column(String, default="")
    # Added after Zahid's "visual hierarchy" review of the Goal editor:
    # knowing the goal and knowing the task doesn't solve procrastination
    # by itself — a goal needs its own single, immediately-executable
    # next physical action, separate from `note` (free-form) and
    # separate from BoardTask.next_action (scoped to one task's board).
    # This one is scoped to the goal itself, for goals that haven't been
    # broken into tasks yet, or whose next step isn't task-board work.
    next_action: Mapped[str] = mapped_column(String, default="")
    # ISO date. Added from Zahid's own request: a goal's deadline used to
    # be a pure display computation (start_date + a hardcoded 30-day
    # window, same number for every horizon) rather than stored state —
    # he asked for it to default per horizon instead (7 days / 30 days /
    # 12 months) AND be directly editable via a date picker, which means
    # it has to be real column, not a formula. engine.goals computes the
    # default at creation time (see _default_deadline there); once set,
    # it is ordinary user-editable state like start_date, not
    # recalculated from horizon again.
    #
    # ⚠ Same crossed-keys trap as GoalsPanel.tsx's HORIZONS array: the
    # 7/30/12-month defaults are keyed to Zahid's own wording — "weekly
    # goal 7 day, monthly 30d, yearly 12 month" — which describes the
    # DISPLAYED label, not the stored `horizon` value. Because labels and
    # `horizon` keys are deliberately crossed (see that file's own ⚠
    # comment), the default here is yearly->7d, monthly->30d, weekly->12mo
    # even though that reads backwards next to the horizon name. Do not
    # "fix" this pairing without first re-reading GoalsPanel.tsx's own
    # warning — the two crossings must match or the deadline shown next
    # to "WEEKLY GOAL" would silently stop being 7 days out.
    deadline: Mapped[str] = mapped_column(String, default="")


class GoalTask(Base):
    """A goal's own flat task checklist — add/check/remove straight from
    the Goals panel card, no need to open the goal's Individual Task
    Board (BoardTask/BoardCard) just to jot down and strike a quick
    task. Mirrors ProjectSubtask's shape and convention exactly (`pid`
    is a preserved string id, same "why remap an id nothing outside
    this table needs to be an int" reasoning), scoped to `goal_id`
    rather than `project_key` since Goal's own project_key is opaque
    and sometimes the reserved "life" owner with no real Project row
    (see Goal.project_key's own comment).

    ondelete="CASCADE": a goal-task has no meaning without its Goal —
    same reasoning as BoardTask.goal_id.
    """

    __tablename__ = "goal_tasks"

    pid: Mapped[str] = mapped_column(String, primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(String)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    added_date: Mapped[str] = mapped_column(String)  # ISO date string


BOARD_COLS = ("todo", "focus", "done")
BOARD_PRIORITIES = ("low", "normal", "high")


class BoardTask(Base):
    """One row per Task under a Goal's Individual Task Board feature.
    NOT the same thing as the daily-execution `Task` model — this is
    the middle tier of the hierarchy the user asked for explicitly:

        Goal -> Task 1..N -> that Task's own Individual Task Board
                              (QUEUED / FOCUS / CLOSED)

    Superseded design note: an earlier version of this feature put
    BoardCard directly under project_key, with an optional goal_id
    backlink for cards created from a Goal's "→ BOARD" button (see the
    now-dropped `48d822248fb2` migration). That flat shape only grouped
    cards by goal; it had no notion of a Task in between, and every
    card on a project shared one undifferentiated board. The user
    corrected this: each Goal breaks into several Tasks, and each Task
    gets its OWN separate 3-column board, not one shared board grouped
    by goal. This model is the replacement for that design, not an
    addition to it.

    ondelete="CASCADE": a Task has no meaning without its Goal (it's
    literally "break this goal into parts"), so when the goal goes,
    its tasks go with it — unlike the old goal_id backlink on BoardCard,
    which used SET NULL because a card was independent queued work.
    Here the Task *is* the goal's breakdown, so CASCADE is correct.

    `outcome` — added after Zahid reviewed the overlay against the
    standalone `ele kanban` pilot's own Focus Board screen (which had a
    milestone-ladder / units-sold / target-date header). Those three
    widgets are that pilot's own venture-tracking clutter, not something
    this hierarchy has or needs — but the underlying idea he wanted kept
    was real: a task's board should open under a one-line "what finishes
    this" statement, the way the pilot's header oriented the whole
    screen before showing any columns. "Task outcome / Definition of
    Done" is that one line, scoped to the task instead of a venture."""

    __tablename__ = "board_tasks"

    # ms-timestamp id, matching Task/Goal/CirclePerson's convention.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String)
    outcome: Mapped[str] = mapped_column(String, default="")
    # The task-scoped twin of Goal.next_action — see that column's
    # comment. This one is "what finishes the CURRENT card/session on
    # this task's own board", not the goal's next step.
    next_action: Mapped[str] = mapped_column(String, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class BoardCard(Base):
    """One row per kanban card on a Task's Individual Task Board.
    Ported from the standalone `ele kanban` Electron pilot's Card
    contract (id/col/title/note/priority/pinned) verbatim.

    Reworked from the earlier project_key-scoped design (see BoardTask's
    docstring) to be scoped to exactly one BoardTask instead — every
    card now lives under Goal -> Task -> [cards], not directly under a
    project. `project_key` and the old optional `goal_id` backlink are
    both dropped; `task_id` is the only, required scope.

    Deliberately its own table rather than rows in `tasks`: a
    build-queue card has no day, no MIT flag, none of Task's other
    columns — forcing it into that table would mean either nullable
    columns that make no sense here or a shared row shape meaningful for
    neither use (same reasoning JourneyTask already applies).

    `secs`/`sessions` — added 2026-09-16 (Zahid: a real start/stop timer
    on the card sitting in FOCUS, not the old standalone `ele kanban`
    pilot's cosmetic countdown). This paragraph used to say a
    build-queue card has "no timer" — that was true until this request;
    corrected rather than left standing as a stale claim. Same shape and
    same idle-capped credit-on-stop accounting as `Task.secs`/
    `Task.sessions` (see engine.timer_reconciliation), reused rather
    than reinvented — `tick_task`/`stop_task_session` there now accept
    either model, since both share this exact `secs: float` + `sessions:
    [{"start","end","checkpoint"?}]` shape. Unlike Task, a BoardCard's
    timer is meant to track focused time on THIS card specifically, so
    nothing here enforces "only one card timer running at once" — same
    as Task's own per-task timers, which already run concurrently with
    each other; only NOW is exclusive.

    `col` is the kanban column, not a boolean — matches the pilot's own
    three-state model exactly (todo/focus/done, shown to the user as
    QUEUED/FOCUS/CLOSED) rather than reusing Task.done + Task.strike,
    because a build-queue card's "in focus" has nothing to do with the
    daily EXECUTE screen's STRIKE commitment and conflating them would
    make one card mean two unrelated things depending on which screen
    you read it from.

    ondelete="CASCADE": a card has no meaning once its Task is gone —
    unlike the dropped goal_id backlink (SET NULL, because a card used
    to be independent queued work that merely referenced a goal), a
    card here only exists as that task's breakdown, so it goes with it."""

    __tablename__ = "board_cards"

    # ms-timestamp id, matching Task/Goal/CirclePerson's convention.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    task_id: Mapped[int] = mapped_column(ForeignKey("board_tasks.id", ondelete="CASCADE"))
    col: Mapped[str] = mapped_column(String, default="todo")  # todo | focus | done
    title: Mapped[str] = mapped_column(String)
    note: Mapped[str] = mapped_column(String, default="")
    priority: Mapped[str] = mapped_column(String, default="normal")  # low | normal | high
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    secs: Mapped[float] = mapped_column(Float, default=0.0)
    sessions: Mapped[list] = mapped_column(JSON, default=list)  # [{"start": ts, "end": ts|null}]
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


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
    - life_plan_headline: SUPERSEDED. The original "Life Plan" was a
      single free-text line shown in panel 2 when every project is
      collapsed — corrected (2026-09-17) to a "life" virtual project
      instead, with its own real weekly/monthly/yearly goals in the
      `goals` table (project_key="life", see that column's own comment)
      shown through the ordinary GoalsPanel. Column kept, unused, same
      convention as every other superseded-but-not-dropped column in
      this app (DailyIntention.text/win/reflection, BusinessAnalysis.
      decision_status, etc) — nothing ever asked for whatever headline
      Zahid may have already typed to be destroyed.
    - sec_title_yearly/monthly/weekly: MOVED to Project (2026-09-19,
      Zahid: renaming "Weekly Goal" while looking at one project was
      bleeding into every other project's Goals panel). Legacy kept
      these in a global dict despite goals themselves being
      per-project; this port initially preserved that split, but it
      read as a bug, not a quirk worth keeping, so each project now
      carries its own three headings — see Project's own comment.
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
      hand). start_with_windows is just the stored preference — the
      actual OS registration (`app.setLoginItemSettings`) lives in
      electron/main.ts, which syncs it on every settings save and
      re-asserts it on launch.
    - bdp_sort: Business Plan Notes' list-ordering mode ("manual" |
      "priority") — a single global toggle for that one screen, matching
      the legacy screen's own `vd["sort"]`, same shape as task_day_view
      above.
    - bdp_view: which of that screen's three layouts is showing ("card" |
      "table" | "list"). Stored beside bdp_sort rather than in local
      component state because it is a working preference — you pick
      "table" to scan twenty plans and expect it still to be table
      tomorrow, exactly as with bdp_sort.
    - panel_layout: "full", "partial" or "compact" — legacy's progressive
      panel layout. All three rungs, since the shell is now the same
      three columns legacy has (see docs/ROW10_LAYOUT_NOTE.md).
      Same reasoning as bdp_view for storing it rather than keeping it
      in component state: a window you left docked and narrow should
      still be docked and narrow next time.
    - q90_cycle_start/q90_cycle_days: the 90-Day (or N-day) Quarterly
      Plan's cycle anchor and length, matching legacy's
      `self._settings["cycle_start"/"cycle_days"]`. NULL cycle_start
      means "no cycle chosen yet" — falls back to the calendar quarter
      containing today, same as legacy's own fallback, so a fresh
      install needs no setup step before the screen means something.
    - task_title_classic_today/classic_tomorrow/focus_today/focus_tomorrow:
      user-renamed Tasks-list headings, one per (list × day-view) —
      matches legacy's four `_task_title[_focus][_tomorrow]` keys. NULL
      falls back to a computed default ("TODAY'S TARGETS" / "LIST" /
      etc, see engine.tasks.default_task_title) the same way
      sec_title_* above falls back for Goals.
    - mit_prompt_date: last date the "what's today's MIT?" prompt was
      shown, matching legacy's `self._settings["mit_prompt_date"]` —
      caps it at once per day the same lazy-check way as
      last_strike_reset_day above (no live day-rollover tick to hang a
      cron off of).
    - trend_days: window length (30 | 90) for the Deep Work Trend chart,
      matching legacy's `self._settings["trend_days"]`."""

    __tablename__ = "app_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    last_strike_reset_day: Mapped[str | None] = mapped_column(String, nullable=True)
    task_day_view: Mapped[str] = mapped_column(String, default="today")
    theme: Mapped[str] = mapped_column(String, default="focus")
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    goal_project: Mapped[str] = mapped_column(String, default="proj1")
    life_plan_headline: Mapped[str | None] = mapped_column(String, nullable=True)
    now_task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    lang: Mapped[str] = mapped_column(String, default="en")
    analog_clock: Mapped[bool] = mapped_column(Boolean, default=False)
    # PLAN reorders itself by time of day (morning / work / evening)
    # unless this is switched off in Settings.
    plan_adaptive: Mapped[bool] = mapped_column(Boolean, default=True)
    # Tomorrow's three, picked in the evening: {"day": "YYYY-MM-DD",
    # "ids": [task ids]}. Applied as that day's strike list at the day
    # rollover (engine.tasks.reset_strike_if_new_day), then cleared.
    tomorrow_three: Mapped[dict] = mapped_column(JSON, default=dict)
    # How each past day's three went, recorded at the rollover before
    # the strike flags are cleared: {"YYYY-MM-DD": [done, total]}.
    three_history: Mapped[dict] = mapped_column(JSON, default=dict)
    auto_timer_on_open: Mapped[bool] = mapped_column(Boolean, default=True)
    idle_stop_min: Mapped[int] = mapped_column(Integer, default=15)
    phase_morning_start: Mapped[int] = mapped_column(Integer, default=5)
    phase_work_start: Mapped[int] = mapped_column(Integer, default=9)
    phase_evening_start: Mapped[int] = mapped_column(Integer, default=18)
    phase_sleep_start: Mapped[int] = mapped_column(Integer, default=23)
    goal_hours: Mapped[int] = mapped_column(Integer, default=5)
    currency: Mapped[str] = mapped_column(String, default="$")
    start_with_windows: Mapped[bool] = mapped_column(Boolean, default=False)
    bdp_sort: Mapped[str] = mapped_column(String, default="manual")
    bdp_view: Mapped[str] = mapped_column(String, default="card")
    panel_layout: Mapped[str] = mapped_column(String, default="full")
    # Which of EXECUTE's three tabs is showing. Legacy persists this
    # (its `focus_tab`) rather than resetting to HOURS each launch: the
    # tab you work in is a preference, not a per-session accident.
    # Briefly renamed to a 4-value daily/weekly/monthly/yearly accordion
    # (migration b2f7a83c9e14) before the user asked to simplify back to
    # this three-tab shape, with the new DAILY/WEEKLY/MONTHLY/YEARLY
    # levels nested inside the HOURS tab instead (see migration
    # c9a1f4d872e6 and Panel3.tsx).
    focus_tab: Mapped[str] = mapped_column(String, default="hours")
    q90_cycle_start: Mapped[str | None] = mapped_column(String, nullable=True)
    q90_cycle_days: Mapped[int] = mapped_column(Integer, default=90)
    # The one Transformation area this cycle is about (a Q90 area key),
    # or None when none has been starred yet.
    q90_focus_area: Mapped[str | None] = mapped_column(String, nullable=True)
    task_title_classic_today: Mapped[str | None] = mapped_column(String, nullable=True)
    task_title_classic_tomorrow: Mapped[str | None] = mapped_column(String, nullable=True)
    task_title_focus_today: Mapped[str | None] = mapped_column(String, nullable=True)
    task_title_focus_tomorrow: Mapped[str | None] = mapped_column(String, nullable=True)
    mit_prompt_date: Mapped[str | None] = mapped_column(String, nullable=True)
    trend_days: Mapped[int] = mapped_column(Integer, default=30)


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
    # The vision half of the page (2026-09-24): why this project matters,
    # what "done" looks like (a headline number plus a line under it),
    # the date it is aimed at, and a few pinned words or pictures. All
    # free text the owner writes; nothing is derived from them.
    why: Mapped[str] = mapped_column(String, default="")
    vision: Mapped[str] = mapped_column(String, default="")
    vision_note: Mapped[str] = mapped_column(String, default="")
    target_date: Mapped[str] = mapped_column(String, default="")  # YYYY-MM-DD or ""
    # [{"kind": "word"|"image", "value": text or absolute image path}]
    pins: Mapped[list] = mapped_column(JSON, default=list)
    # Day of the last real step (a task or gate ticked, a task or log
    # added) — "last move · 2 days ago" on the page. "" = none yet.
    last_move: Mapped[str] = mapped_column(String, default="")


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


BDP_STATUSES = ("IDEA", "OPPORTUNITY", "RESEARCH", "PLAN", "ACTIVE", "HOLD", "DONE")
BDP_PRIORITIES = ("HIGH", "MEDIUM", "LOW")


class BdpPlan(Base):
    """One row per Business Plan Notes opportunity card — a single
    global list (not per-project, unlike Goals/Journey/BusinessAnalysis;
    legacy's own `vision_data["self_dev"]["plans"]` isn't project-scoped
    either). Replaces the legacy screen's earlier fixed 6-block layout,
    same reasoning `import_legacy.py` never needed to touch since this
    is a fresh feature area for the port (no existing rows to migrate
    forward). `order` is a float, not an int, so a new plan can be
    inserted at the very top (`min(existing) - 1.0`) or a plan moved
    between two neighbors without renumbering the whole list — same
    technique Task/Goal use elsewhere via ms-timestamp ids, adapted here
    since manual order is independent of creation time."""

    __tablename__ = "bdp_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    title: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="IDEA")
    priority: Mapped[str] = mapped_column(String, default="MEDIUM")
    opportunity: Mapped[str] = mapped_column(String, default="")
    market: Mapped[str] = mapped_column(String, default="")
    target: Mapped[str] = mapped_column(String, default="")
    niche: Mapped[str] = mapped_column(String, default="")
    model: Mapped[str] = mapped_column(String, default="")
    product: Mapped[str] = mapped_column(String, default="")
    service: Mapped[str] = mapped_column(String, default="")
    supplier: Mapped[str] = mapped_column(String, default="")
    timeline: Mapped[str] = mapped_column(String, default="")
    potential: Mapped[int] = mapped_column(Integer, default=3)  # 1-5 stars
    difficulty: Mapped[int] = mapped_column(Integer, default=3)  # 1-5 stars
    cost_amount: Mapped[str] = mapped_column(String, default="")  # free text, matches legacy's plain Entry
    yearly_profit: Mapped[str] = mapped_column(String, default="")
    notes: Mapped[str] = mapped_column(String, default="")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    # Empty until first edited — matches legacy, which never sets either
    # on a freshly seeded/created plan, only on first _plan_modal commit.
    created: Mapped[str] = mapped_column(String, default="")  # ISO date string
    updated: Mapped[str] = mapped_column(String, default="")  # ISO date string
    order: Mapped[float] = mapped_column(Float, default=0.0)


class BdpAction(Base):
    """A plan's next-actions checklist. Legacy stores these as a bare
    `[{"text", "done"}]` list edited by retyping a whole textarea (one
    line per action) and re-matching ticked state back onto surviving
    lines by exact text — real ids weren't worth adding there since the
    whole list was already being replaced on every edit. This port gives
    each action its own ms-timestamp id instead (same convention as
    JourneyTask), so toggling/editing/deleting one action is a targeted
    operation rather than a fragile whole-list retype-and-text-match."""

    __tablename__ = "bdp_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    plan_id: Mapped[int] = mapped_column(ForeignKey("bdp_plans.id"))
    text: Mapped[str] = mapped_column(String)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


# Craft/career is deliberately absent — that's what the 6 Projects and
# their Goals already are, and a plan that asks the same question twice
# gets two different answers (matches legacy's own reasoning verbatim).
Q90_AREAS = (
    ("appearance", "Appearance", "◈", "How you show up — body, grooming, clothes, posture."),
    ("money", "Money", "◉", "Earned, saved, owed. The number, not the feeling."),
    ("relationship", "Relationship", "❖", "The one closest person. Partner, or the one who matters most."),
    ("health", "Health", "◐", "Sleep, food, movement, the check-up you keep postponing."),
    ("social", "Friends · Family · Social", "◇", "The people who would notice if you disappeared for a month."),
    ("mind", "Mind · Skill", "◎", "What you are learning, and what you want to be able to do."),
)
Q90_CYCLE_PRESETS = (30, 60, 90)
Q90_CYCLE_MIN, Q90_CYCLE_MAX = 7, 365


class Outcome(Base):
    """Top of the planning hierarchy — one per (owner, year). See
    `engine/planning.py`'s `outcome_progress` for how its progress is
    always derived from its Milestones, never stored directly unless
    `fixed`.

    `legacy_goal_id` is set only by the Phase A migration, for rows
    forward-copied from an old yearly-horizon `Goal` — it exists purely
    so Panel 2's re-parent fix-up UI can show "this came from your old
    goal" and so Board (Phase B, still reading `goals`/`goal_tasks`
    unmodified) can be offered on migrated nodes. Never read by
    `engine/planning.py`'s progress functions or any other business
    logic — a manually-created Outcome has this as `None` and behaves
    identically to a migrated one everywhere except that fix-up hint and
    Board access.
    """

    __tablename__ = "outcomes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    owner_key: Mapped[str] = mapped_column(String)  # GoalOwnerKeyT: proj1..proj6 | "life"
    title: Mapped[str] = mapped_column(String)
    year: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String, default="active")  # active | achieved | dropped
    fixed: Mapped[bool] = mapped_column(Boolean, default=False)
    progress: Mapped[int] = mapped_column(Integer, default=0)  # stored value, only meaningful when fixed
    legacy_goal_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Milestone(Base):
    """One per (Outcome, month). See Outcome's docstring for
    `legacy_goal_id`; identical reasoning here."""

    __tablename__ = "milestones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    outcome_id: Mapped[int] = mapped_column(ForeignKey("outcomes.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String)
    month: Mapped[int] = mapped_column(Integer)
    year: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String, default="active")
    fixed: Mapped[bool] = mapped_column(Boolean, default=False)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    legacy_goal_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Win(Base):
    """One per (Milestone, week) — a Win is never a checkbox property
    bolted onto a task (see the Phase A spec's locked interaction
    contract): it has its own title, a `criteria` string, and progress
    always derived from its PlanTasks unless `fixed`. `week_start_date`
    is the Monday of the week this Win belongs to (ISO date string) —
    there is no separate week-container table; week identity is this
    column plus ordinary date arithmetic, per the spec's decision not to
    add one."""

    __tablename__ = "wins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    milestone_id: Mapped[int] = mapped_column(ForeignKey("milestones.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String)
    week_start_date: Mapped[str] = mapped_column(String)  # ISO date, Monday
    criteria: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="active")  # active | achieved | dropped
    fixed: Mapped[bool] = mapped_column(Boolean, default=False)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    legacy_goal_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class PlanTask(Base):
    """The day-scheduled, Board-linkable leaf of the hierarchy — NOT the
    same thing as `Task` (daily execution / hour-plan) or `GoalTask`
    (the old flat per-goal checklist, still live under `goals` for
    Board's sake). `win_id` is nullable: a task can exist unscheduled
    (Carry Forward's "Backlog" action sets both `win_id` and
    `scheduled_date` to null) or scheduled to a day without yet being
    tied to a Win. `owner_key` is denormalized onto the task itself
    (not derived by walking win->milestone->outcome) so a task can be
    created and scheduled before it has a Win — same reasoning `Goal`
    stores its own `project_key` rather than deriving it.

    ondelete="SET NULL" on win_id (not CASCADE): completing/deleting the
    Win a task supported should not delete the task itself, only detach
    it — matches Carry Forward's Backlog action already doing this same
    detach by hand.
    """

    __tablename__ = "plan_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    win_id: Mapped[int | None] = mapped_column(ForeignKey("wins.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String)
    scheduled_date: Mapped[str | None] = mapped_column(String, nullable=True)  # ISO date
    status: Mapped[str] = mapped_column(String, default="open")  # open | done | dropped
    owner_key: Mapped[str] = mapped_column(String)


class ChecklistItem(Base):
    """A plain, unscheduled checklist item — the same shape as the old
    `GoalTask` (add/check/remove straight from a card, no scheduling, no
    Board), re-pointed to attach to exactly one of Outcome/Milestone/Win
    instead of a single flat Goal. Engine-layer enforced: exactly one of
    `outcome_id`/`milestone_id`/`win_id` is set per row, never zero or
    two (see `engine/planning.py`'s `add_checklist_item`).

    ondelete="CASCADE" on all three: a checklist item has no meaning
    without its parent node, same reasoning `GoalTask.goal_id` already
    uses.
    """

    __tablename__ = "checklist_items"

    pid: Mapped[str] = mapped_column(String, primary_key=True)
    outcome_id: Mapped[int | None] = mapped_column(ForeignKey("outcomes.id", ondelete="CASCADE"), nullable=True)
    milestone_id: Mapped[int | None] = mapped_column(ForeignKey("milestones.id", ondelete="CASCADE"), nullable=True)
    win_id: Mapped[int | None] = mapped_column(ForeignKey("wins.id", ondelete="CASCADE"), nullable=True)
    text: Mapped[str] = mapped_column(String)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    added_date: Mapped[str] = mapped_column(String)


class QuarterlyAnswer(Base):
    """One row per (cycle, area) — legacy instead keys a single
    `_habit_data["__q90_<cycle-start>"]` dict by cycle-start-date string,
    holding all 6 areas' answers as a nested dict. Flattened here to one
    row per area, same reasoning Goal already applied to the
    yearly/monthly/weekly split: `cycle_start` (not a table per cycle)
    is what identifies which cycle a row belongs to, since cycles repeat
    forever and old ones must stay reachable rather than being
    overwritten.

    V2 (2026-09-16) — "112-Day Transformation Board" rewrite, from
    Zahid's own detailed spec: the flat Outcome/weekly-Action/If-then
    shape (`out`/`act`/`ifthen`) is replaced by a 7-step sequence
    (current_reality -> destination -> proof -> gap -> major_changes ->
    weekly_lead_behavior -> obstacle_if/response_then), plus explicit
    status derivation and destination versioning. `out`/`act`/`ifthen`
    are kept, unused, exactly the same judgment call as every other
    "stop reading it, never delete it" column in this app (BusinessAnalysis's
    decision_status, DailyIntention's .text/.win/.reflection): their
    content is copied forward into the new columns by migration
    `4f3e39858a82` on upgrade, so nothing existing is lost, but nothing new is
    ever written to them again.
    """

    __tablename__ = "quarterly_answers"
    __table_args__ = (UniqueConstraint("cycle_start", "area", name="uq_qplan_cycle_area"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cycle_start: Mapped[str] = mapped_column(String)  # ISO date identifying the cycle
    area: Mapped[str] = mapped_column(String)
    out: Mapped[str] = mapped_column(String, default="")  # superseded by `destination` — see class docstring
    act: Mapped[str] = mapped_column(String, default="")  # superseded by `weekly_lead_behavior`
    ifthen: Mapped[str] = mapped_column(String, default="")  # superseded by `response_then`

    # Step 1 — WHERE AM I NOW? Facts/numbers, not feelings (guidance
    # only, never enforced server-side — see Zahid's own spec §7/§30).
    current_reality: Mapped[str] = mapped_column(String, default="")
    # Step 2 — WHERE AM I GOING? The single measurable destination for
    # this cycle. Editing this directly (autosave, like every other text
    # field in this app) is the normal path; `change_destination` below
    # is the separate, deliberate "log why this changed" path.
    destination: Mapped[str] = mapped_column(String, default="")
    # Step 2b — PROOF: how achieving the destination will be verified.
    proof: Mapped[str] = mapped_column(String, default="")
    # Explicit user action, not inferred from field-completeness — see
    # compute_status's own docstring for why "all fields filled" must
    # never equal PROVEN on its own.
    achieved: Mapped[bool] = mapped_column(Boolean, default=False)
    # Step 3 — THE GAP: free text; V2 does not attempt to numerically
    # diff current_reality/destination (Zahid's own spec §10: no
    # "complicated universal calculation engine" for this).
    gap: Mapped[str] = mapped_column(String, default="")
    # Step 4 — MAJOR CHANGES: up to 5 {"id": int, "text": str,
    # "completed": bool} entries. A strategic list, not a task list —
    # see engine/quarterly.py's own note on that distinction.
    major_changes: Mapped[list] = mapped_column(JSON, default=list)
    # Step 5 — WEEKLY LEAD BEHAVIOR: deliberately ONE field, not a list
    # — the whole point is forcing a single repeatable behavior rather
    # than an open-ended set (Zahid's own spec §14).
    weekly_lead_behavior: Mapped[str] = mapped_column(String, default="")
    # Step 6 — WHEN THE PLAN BREAKS: an implementation-intention pair,
    # kept as two short fields rather than one merged one so the
    # IF/THEN shape is structural, not just a suggestion in the hint
    # text (unlike the old single `ifthen` field it replaces).
    obstacle_if: Mapped[str] = mapped_column(String, default="")
    response_then: Mapped[str] = mapped_column(String, default="")
    # Step 7 — REVIEW & RECALIBRATE's "Change Goal" path: every
    # deliberate destination change appends the OLD destination (plus
    # why/what-evidence) here and bumps the version, rather than
    # silently overwriting it — Zahid's own spec §18-20, "this creates a
    # useful personal decision history". Routine edits to `destination`
    # (the normal autosave path) do NOT touch these two fields — only
    # the explicit change_destination() action does.
    goal_version: Mapped[int] = mapped_column(Integer, default=1)
    goal_history: Mapped[list] = mapped_column(JSON, default=list)
    # Weekly check: the cycle's week numbers (1-based) in which the
    # weekly lead behavior actually happened. Ticked by hand, only for
    # weeks that have started.
    week_checks: Mapped[list] = mapped_column(JSON, default=list)


class Q90AreaMeta(Base):
    """User overrides for one Q90 area's label/description — Q90_AREAS
    above is only the seed value a fresh install starts from, same
    "seed, then user-renamable" split JourneyStage already uses for its
    stage name/description (see JOURNEY_STAGES' own comment). Global,
    not per-cycle: renaming "Money" to "Finances" should survive every
    cycle rollover, not reset along with the plan itself, which is why
    this is its own singleton-per-area table rather than columns on
    QuarterlyAnswer. A row only exists once its area has been renamed;
    engine.quarterly falls back to the Q90_AREAS default whenever no
    row (or a blanked-out field) is found, so an area can never end up
    with a blank name or description.

    sort_order (2026-09-21, drag-to-reorder): the area's position in
    the panel. Defaults to its index in Q90_AREAS for any area that has
    never been touched; engine.quarterly.reorder_areas writes an
    explicit value for every area at once (never just the two that
    visibly swapped), so once a user has reordered even once, ordering
    is unambiguous — no area is ever comparing an explicit value
    against another area's implicit tuple-index default."""

    __tablename__ = "q90_area_meta"

    area_key: Mapped[str] = mapped_column(String, primary_key=True)
    label: Mapped[str] = mapped_column(String, default="")
    description: Mapped[str] = mapped_column(String, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class HourSlot(Base):
    """One planned hour of one day — the TODAY tab's hour-by-hour plan.

    Legacy keeps this as `_habit_data["__exec_<date>"]`, a dict of
    {"<hour>": {"t": text, "d": done}} (task_tracker_v3_THEMES.py
    5546-5563). Flattened to a row per (day, hour) for the same reason
    QuarterlyAnswer was: a nested blob cannot be queried, migrated or
    partially written, and every other per-day structure here is already
    one row per thing.

    Only slots the user has actually typed into exist. An empty hour is
    the ABSENCE of a row, not a row with an empty string — legacy makes
    the same distinction and says why: "an empty hour is not a task you
    failed to do", so it must not count toward the day's planned total.

    Which hours belong to Morning/Work/Evening/Sleep is NOT stored. It
    is derived from the four phase-start settings at read time, so
    retiming your day retimes this too — legacy's note: "One clock, one
    set of boundaries."
    """

    __tablename__ = "hour_slots"
    __table_args__ = (UniqueConstraint("day", "hour", name="uq_hour_slot_day_hour"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # The day this entry was written. For a one-off that is also the only
    # day it appears; for a carried one it is where the carry starts.
    day: Mapped[str] = mapped_column(String)  # ISO date string
    hour: Mapped[int] = mapped_column(Integer)  # 0-23, local time
    text: Mapped[str] = mapped_column(String, default="")
    done: Mapped[bool] = mapped_column(Boolean, default=False)

    # "Repeat until I finish it" — NOT a habit.
    #
    # The day starts fresh: an ordinary entry belongs to its date and
    # tomorrow opens empty. An entry marked `repeat` is the exception —
    # it reappears at its hour every day until the day it is ticked, and
    # then stops. That is a task important enough to keep asking, not a
    # routine that recurs forever, so nothing here needs a weekday mask
    # or an end date.
    repeat: Mapped[bool] = mapped_column(Boolean, default=False)

    # WHICH day it was finished, not just that it was. A carried entry
    # has to show as done on the day you ticked it and be gone the next
    # morning; a single boolean cannot say which day that was, so the
    # entry would either vanish from the day you completed it or linger
    # on every later one.
    done_day: Mapped[str | None] = mapped_column(String, nullable=True)


class MorningRitual(Base):
    """One row per day — the guided Morning Ritual module (Zahid's
    Discipline brainstorm, 2026-09-14): a SEPARATE, new area from the
    flat Money/Health/Relation/Mind checklist above (HABIT_CATEGORIES /
    Habit / HabitCompletion), not a replacement for it.

    Shape matches DailyIntention (one row keyed by ISO day, created on
    first touch) rather than a step-log table — "today's state" is the
    whole of what needs to be stored and read back.

    REBUILT 2026-09-15 to match Zahid's own fuller "Morning Activation"
    brainstorm prototype (a standalone HTML/JS mockup he built/sourced
    separately, uploaded this round: "brainstorm ami ai page er content
    gula miss korte si" — the shipped 7-step wizard v1 above was missing
    most of that prototype's content). This SUPERSEDES the original
    linear 7-step wizard entirely — v1's `step`/`wake_done`/
    `journal_feeling`/`journal_priority`/`meditation_*`/`intention`/
    `preview_seen` fields are gone, replaced by the section below. The
    table is dropped and recreated rather than ALTERed (migration
    `900eb301a04b`): it was created less than 24 hours earlier in this
    same session with no real user data at stake, and Zahid's own
    instruction was a "full rebuild," not an incremental migration of
    v1's shape.

    The prototype is one continuous page (SEE -> CHECK-IN/RESET -> CLEAR
    YOUR MIND -> MORNING PRIME -> START NOW), not a step-locked wizard —
    there is no `step`/resume-position field here because there is no
    fixed step order to resume into; every section just reads/writes its
    own fields directly, and the frontend page can be reopened and
    re-scrolled freely.

    One piece of the prototype is still deliberately NOT wired up, per
    Zahid's own explicit descoping when this rebuild was scoped via
    AskUserQuestion:
      - The "AI-suggested next action" from the journal text is a
        regex/keyword heuristic (see engine.morning_ritual.suggest_action),
        not a real AI call — Zahid chose the heuristic over integrating
        the prototype's planned local Ollama coach for now
        ("সহজ heuristic... দিয়ে শুরু করি").
    """

    __tablename__ = "morning_rituals"

    day: Mapped[str] = mapped_column(String, primary_key=True)  # ISO date string

    # ── SEE ───────────────────────────────────────────────────────────
    # Editable in place (click-to-edit in the prototype); pre-filled from
    # last night's Night Closure once that exists, blank until then.
    today_outcome: Mapped[str] = mapped_column(String, default="")
    first_move: Mapped[str] = mapped_column(String, default="")
    # ISO date of the NightClosure row this was carried from, if any —
    # set by MorningRitualEngine._apply_carry_forward the first time a
    # day's row is touched, from the previous day's NightClosure (see
    # that model's own docstring). None on a day with no prior closure.
    carried_from_date: Mapped[str | None] = mapped_column(String, nullable=True)

    # ── CHECK-IN ──────────────────────────────────────────────────────
    # Categorical, matching the prototype's own pill labels exactly
    # (LOW/OKAY/GOOD/STRONG for energy; LOW/NEUTRAL/GOOD/POSITIVE for
    # mood; POOR/OKAY/GOOD for sleep) — not the old v1's 1-5 numeric
    # scale, which this brainstorm never used. Validated in the engine,
    # not the database (matches this app's existing convention for
    # other plain-string categorical fields like Goal.horizon).
    energy: Mapped[str | None] = mapped_column(String, nullable=True)
    mood: Mapped[str | None] = mapped_column(String, nullable=True)
    sleep_quality: Mapped[str | None] = mapped_column(String, nullable=True)
    # "HH:MM", 24h, whatever the browser's native time input hands back —
    # not validated further here for the same reason sleep_quality isn't
    # (engine-side validation, matching this app's existing convention).
    wake_up_time: Mapped[str | None] = mapped_column(String, nullable=True)
    # Derived from `energy` the moment it's set (see
    # MorningRitualEngine.ENERGY_MODE_MAP) and stored, not recomputed on
    # every read — the prototype's own JS sets this once per check-in
    # and never re-derives it later, and storing it is what lets the
    # trend view show mode history even if the energy-to-mode mapping
    # changes in a future version.
    morning_mode: Mapped[str] = mapped_column(String, default="standard")

    # ── RESET ─────────────────────────────────────────────────────────
    # One-way: the prototype's Breathe chip finishes a 60s timer and
    # stays "done" — there's no un-ticking a breathing exercise you
    # already did. Move/Daylight are plain toggle chips (can be
    # unchecked), matching the prototype's `classList.toggle('done')`.
    reset_breathe: Mapped[bool] = mapped_column(Boolean, default=False)
    reset_move: Mapped[bool] = mapped_column(Boolean, default=False)
    reset_daylight: Mapped[bool] = mapped_column(Boolean, default=False)
    # Plain toggle chip, same as Move/Daylight — "the cheapest item on
    # the strip" per Zahid's own Morning Activation prototype.
    reset_water: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── CLEAR YOUR MIND ───────────────────────────────────────────────
    journal_text: Mapped[str] = mapped_column(String, default="")
    # None = not yet asked; True = "make it an action" chosen; False =
    # "release & return" chosen. Three states, not two — matches the
    # prototype's `journal_action_needed: null` starting state exactly.
    journal_action_needed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    journal_released: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── MORNING PRIME ─────────────────────────────────────────────────
    prime_meditation: Mapped[bool] = mapped_column(Boolean, default=False)
    prime_visualization: Mapped[bool] = mapped_column(Boolean, default=False)
    prime_reading: Mapped[bool] = mapped_column(Boolean, default=False)
    prime_gratitude: Mapped[str] = mapped_column(String, default="")
    # Focus / Patience / Discipline / Calm, or None if not chosen —
    # matches the prototype's intention chip row exactly (a different,
    # smaller concept from v1's free-text `intention` field, which this
    # rebuild removes).
    prime_intention: Mapped[str | None] = mapped_column(String, nullable=True)
    # OFF / Prayer / Dhikr / Quran / Meditation / Personal Reflection /
    # Custom — matches the prototype's <select> options exactly.
    prime_spiritual: Mapped[str] = mapped_column(String, default="OFF")

    # ── START NOW ─────────────────────────────────────────────────────
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    # Unix timestamps. `started_at` is set the first time today's row is
    # touched at all (page load) — the prototype's own "time to first
    # action" KPI is `started_first_action_at - started_at`, so both
    # ends of that measurement need to be real, separately-stamped
    # moments, not one timestamp doing double duty.
    started_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    started_first_action_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    completed_at: Mapped[float | None] = mapped_column(Float, nullable=True)


class NightClosure(Base):
    """One row per day — the evening counterpart to MorningRitual above,
    the "Night Closure" feature that class's own docstring names as not
    yet existing. Same day-keyed, created-on-first-touch shape.

    `tomorrow_outcome`/`tomorrow_first_action` are what
    MorningRitualEngine reads back the next morning to populate that
    day's `today_outcome`/`first_move` and stamp `carried_from_date` —
    the two tables are linked by day arithmetic (this row's `day` is
    read as "yesterday" by the morning row for `day + 1`), not a
    foreign key, matching this app's existing convention for other
    day-keyed pairs (e.g. DailyIntention).

    Converted from Zahid's own HTML/JS mockup (night-closure.html,
    localStorage key `lifeos_night_closure`) — same four top fields,
    same optional blocker/note, same Wind Down tools (4-7-8 Breathe /
    Cognitive Shuffle / Muscle Release), moved to real per-day
    persistence instead of localStorage so it can actually feed
    MorningRitual's carried-from block.
    """

    __tablename__ = "night_closures"

    day: Mapped[str] = mapped_column(String, primary_key=True)  # ISO date string

    where_stopped: Mapped[str] = mapped_column(String, default="")
    unfinished: Mapped[str] = mapped_column(String, default="")
    tomorrow_outcome: Mapped[str] = mapped_column(String, default="")
    tomorrow_first_action: Mapped[str] = mapped_column(String, default="")
    optional_blocker: Mapped[str] = mapped_column(String, default="")
    optional_note: Mapped[str] = mapped_column(String, default="")

    # "HH:MM", same free-form convention as MorningRitual.wake_up_time —
    # editable any time before closing, not stamped automatically.
    close_time: Mapped[str | None] = mapped_column(String, nullable=True)

    # Set once, by the "Close the day" button — the completion marker
    # MorningRitualEngine's carry-forward is not gated on (a closure can
    # be read back the next morning whether or not it was ever formally
    # "closed"; closed_at is purely a "did I press the button" record
    # for this row's own UI, same role start_now's completed_at plays
    # for MorningRitual).
    closed_at: Mapped[float | None] = mapped_column(Float, nullable=True)


class HabitItem(Base):
    """A standing daily DO/DON'T commitment — "wake up early", "stop
    smoking" — checked off fresh every day, shown in Morning Ritual.

    Its own table rather than columns on MorningRitual: MorningRitual is
    one row per calendar day (see its own docstring), while a HabitItem
    is a durable thing the user defines once and keeps for months; the
    per-day state lives inside THIS row's own `history`, not as a column
    on the day's row, so the set of habits isn't fixed at however many
    columns a migration once created.

    `history` follows this app's own established convention for
    list-shaped user data (QuarterlyAnswer.major_changes/goal_history)
    rather than a separate checkins table — one JSON array of
    {"date": "YYYY-MM-DD", "done": bool}, one entry per day it was ever
    explicitly checked or unchecked. Small and slow-growing (one entry
    per day, not per interaction), and engine.habits.streak walks it
    backward from today rather than needing a query — same "no
    complicated universal calculation engine" call QuarterlyAnswer's own
    docstring already made for this class of feature.
    """

    __tablename__ = "habit_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String)  # "do" | "dont"
    name: Mapped[str] = mapped_column(String)
    # Freeform — "Morning", "07:00", "Anytime". A label, not a schedule;
    # nothing reads this to fire a reminder.
    time: Mapped[str] = mapped_column(String, default="")
    priority: Mapped[str] = mapped_column(String, default="normal")  # "low" | "normal" | "high"
    # Freeform, in the user's own words — how THEY judge this is being
    # kept (e.g. "no cigarettes, all day" vs "gym receipt"). Never
    # parsed or validated server-side.
    tracking_basis: Mapped[str] = mapped_column(String, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    history: Mapped[list] = mapped_column(JSON, default=list)


class Note(Base):
    """A quick-capture note, shown in EXECUTE's own NOTES tab — global,
    not scoped to any project (Zahid's own choice: "one global list"),
    unlike Goal/GoalTask which are per-project. Deliberately plain text,
    not markdown: no markdown renderer exists anywhere else in this app,
    and speed of capture (the whole point of this feature) favors a
    plain autosizing textarea over a new rendering pipeline.

    `title` is NOT a column — it's derived from the body's own first
    line at read time (engine.notes._title_from_body), the same "don't
    store what you can derive live" choice this app already makes for
    e.g. Goal's day-count progress bar. A single quick-capture box can
    double as both title and body this way, with nothing to keep in
    sync.

    Soft-delete only (`deleted_at`), same convention as every other
    "user asked for this gone but nothing forces immediate destruction"
    choice in this app — here it's also what makes the Ctrl+Z undo
    toast (this app's existing global undo stack, see renderer's
    `undo.tsx`) able to bring a deleted note back with one call rather
    than needing to reconstruct it from scratch.
    """

    __tablename__ = "notes"

    # ms-timestamp id, matching Task/Goal/CirclePerson's convention.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    body: Mapped[str] = mapped_column(String, default="")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[float] = mapped_column(Float)
    updated_at: Mapped[float] = mapped_column(Float)
    deleted_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    # The user-made head (NoteHead) this note is filed under; None = no
    # head (it still shows under All). No FK: deleting a head clears
    # this in the engine, so notes simply fall back to All.
    head_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class NoteHead(Base):
    """A user-made heading in the NOTES tab, shown beside All and Pinned
    (e.g. "Ideas", "Meetings"). A note belongs to at most one."""

    __tablename__ = "note_heads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class HealthProfile(Base):
    """The Health plan's owner profile — one row (id=1). Created by the
    set-up screen; until it exists the Health page shows set-up instead
    of a plan. Targets (kcal/protein/water) are derived from it on every
    read (engine/health.py), never stored, so editing weight re-targets."""

    __tablename__ = "health_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    age: Mapped[int] = mapped_column(Integer)
    sex: Mapped[str] = mapped_column(String)  # "male" | "female"
    height_cm: Mapped[float] = mapped_column(Float)
    weight_kg: Mapped[float] = mapped_column(Float)
    goal: Mapped[str] = mapped_column(String)  # "lose" | "maintain" | "gain"
    activity: Mapped[str] = mapped_column(String)  # "low" | "moderate" | "high"
    place: Mapped[str] = mapped_column(String, default="home")  # "home" | "gym"
    start_date: Mapped[str] = mapped_column(String)  # YYYY-MM-DD, plan day 1
    weeks: Mapped[int] = mapped_column(Integer, default=4)
    # Diet filters ("vegetarian", "no_beef") and foods marked "don't
    # like" — both steer the edit screen's suggestions and library.
    diet: Mapped[list] = mapped_column(JSON, default=list)
    dislikes: Mapped[list] = mapped_column(JSON, default=list)
    # Optional target weight, drawn as a line on the Progress graph.
    goal_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Reminder settings (engine/health.py REMINDER_DEFAULTS); None means
    # all defaults, i.e. reminders off until the user turns them on.
    reminders: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class HealthDayLog(Base):
    """What actually happened on one day of the Health plan: which meal
    slots were eaten (0-3), which workout moves were done ("block-move"
    keys like "1-2"), and glasses of water. Created on first touch."""

    __tablename__ = "health_day_log"

    day: Mapped[str] = mapped_column(String, primary_key=True)
    meals: Mapped[list] = mapped_column(JSON, default=list)
    moves: Mapped[list] = mapped_column(JSON, default=list)
    water: Mapped[int] = mapped_column(Integer, default=0)


class HealthMeasure(Base):
    """One optional body check-in for the Progress page: weight and, if
    the user wants, waist and hip. Keyed by date; any field may be empty
    (logging only the waist leaves the weight alone)."""

    __tablename__ = "health_measure"

    day: Mapped[str] = mapped_column(String, primary_key=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    waist_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    hip_cm: Mapped[float | None] = mapped_column(Float, nullable=True)


class HealthShopItem(Base):
    """The shopping list's user state for one week (Monday date). The list
    itself is built from the week's meals on every read; a row here only
    records a tick on a generated item (custom=False, keyed by its name)
    or an item the user added themselves (custom=True, with its qty)."""

    __tablename__ = "health_shop_item"

    week: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, primary_key=True)
    custom: Mapped[bool] = mapped_column(Boolean, default=False)
    qty: Mapped[str] = mapped_column(String, default="")
    bought: Mapped[bool] = mapped_column(Boolean, default=False)


class HealthOverride(Base):
    """One edit to the default Health plan. `kind` is "meal" (idx = meal
    slot 0-3, data = [{"food", "qty"}]) or "block" (idx = workout block,
    data = [{"name", "dose"}]). `scope` says how far it reaches:
    "day:YYYY-MM-DD" (that date only), "wd:N" (every weekday N, Mon=0),
    or "all" (every day). The most specific one wins; deleting overrides
    is how "reset to default" works."""

    __tablename__ = "health_override"
    __table_args__ = (UniqueConstraint("kind", "scope", "idx", name="uq_health_override"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String)
    scope: Mapped[str] = mapped_column(String)
    idx: Mapped[int] = mapped_column(Integer)
    data: Mapped[list] = mapped_column(JSON, default=list)
