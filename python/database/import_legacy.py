"""One-off importer: pulls every domain the port currently supports —
Tasks, Habits, Projects (subtasks/activity/circle), Business Analysis,
Goals, Product Journey, Business Plan Notes, the 90-Day Quarterly Plan,
and Settings — out of the legacy Tkinter app's JSON blob
(~/.task_tracker_v6.json) and inserts it into the new SQLite tables.
Idempotent — safe to re-run after the legacy app has recorded more
data. Deliberately excludes domains the port doesn't model: the
removed Daily Planner (`_exec_<date>`), the old pre-ba_* SWOT fields,
and the sibling external apps (Life OS, Cash Tracker, etc. — out of
scope, see FEATURE_INVENTORY.md section R).

Usage:
    python -m database.import_legacy /path/to/.task_tracker_v6.json
"""

import json
import re
import sys
import time

from sqlalchemy.orm import Session

from database.connection import SessionLocal
from database.models import (
    AppState,
    BdpAction,
    BdpPlan,
    BusinessAnalysis,
    CirclePerson,
    DailyIntention,
    DecisionLog,
    Goal,
    Habit,
    HabitCompletion,
    JOURNEY_STAGES,
    JourneyLogEntry,
    JourneyStage,
    JourneyTask,
    LegacyAnalysisBox,
    Project,
    ProjectActivity,
    ProjectJourney,
    ProjectSubtask,
    QuarterlyAnswer,
    Task,
)

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_HABIT_CATEGORIES = ("money", "health", "relation", "mind")
_PROJECT_KEYS = ("proj1", "proj2", "proj3", "proj4", "proj5", "proj6")
_BA_TEXT_FIELDS = (
    "idea_business", "idea_problem", "idea_customer", "idea_goal",
    "an_market", "an_competition", "an_strength", "an_risk",
    "fin_investment", "fin_cost", "fin_revenue", "fin_profit",
    "decision_why", "next_action", "next_deadline",
)
_GOAL_HORIZONS = ("yearly", "monthly", "weekly")
_VALID_THEMES = ("focus", "warroom", "energy", "corporate", "journey", "rize")


def _ms_id_counter(start: int):
    """Legacy `next_actions`/journey tasks/log entries carry no id of
    their own (they were retyped/appended in place, never referenced by
    id elsewhere) — this hands out unique ms-timestamp-shaped ids
    matching Task/Goal/CirclePerson's own convention, for tables here
    that DO need a real primary key."""
    counter = [start]

    def _next() -> int:
        counter[0] += 1
        return counter[0]

    return _next


_next_synthetic_id = _ms_id_counter(int(time.time() * 1000))


def _to_task(raw: dict, list_key: str) -> Task:
    return Task(
        id=raw["id"],
        list_key=list_key,
        text=raw.get("text", ""),
        done=bool(raw.get("done", False)),
        secs=float(raw.get("secs", 0.0)),
        sessions=raw.get("sessions", []),
        est=int(raw.get("est", 0)),
        mit=bool(raw.get("mit", False)),
        day=raw.get("day", ""),
        urgency=raw.get("urgency", "med"),
        strike=bool(raw.get("strike", False)),
        project=raw.get("project"),
        psrc=raw.get("psrc"),
    )


def import_tasks(data: dict, db: Session) -> tuple[int, int]:
    imported = skipped = 0
    for list_key, key in (("classic", "tasks"), ("focus", "tasks_focus")):
        for raw in data.get(key, []):
            if db.get(Task, raw["id"]) is not None:
                skipped += 1
                continue
            db.add(_to_task(raw, list_key))
            imported += 1
    return imported, skipped


def import_habits(data: dict, db: Session) -> dict:
    """Reads the flat `habit_data` dict — day-keyed completion grids
    (`{"2026-08-29": {"health": {"Exercise 30min": True, ...}}}`),
    `__habits_{cat}` custom name lists, and `__intention_{day}` texts.
    Everything else in that dict (`__ptime_*`, `__consist_*`, `__circle_*`,
    etc.) belongs to the Projects/Vision feature and is ignored here.
    """
    hd = data.get("habit_data", {})

    name_to_id: dict[str, dict[str, int]] = {}
    for cat in _HABIT_CATEGORIES:
        rows = db.query(Habit).filter(Habit.category == cat).all()
        name_to_id[cat] = {h.name: h.id for h in rows}
    habits_before = sum(len(m) for m in name_to_id.values())

    def get_or_create(cat: str, name: str) -> int:
        m = name_to_id.setdefault(cat, {})
        if name in m:
            return m[name]
        habit = Habit(category=cat, name=name, sort_order=len(m), active=True)
        db.add(habit)
        db.flush()
        m[name] = habit.id
        return habit.id

    # Custom habit lists take priority for ordering, matching the legacy
    # _habits_for() fallback (custom list if present, else defaults —
    # which are already seeded by the migration).
    for cat in _HABIT_CATEGORIES:
        custom = hd.get(f"__habits_{cat}")
        if isinstance(custom, list):
            for i, name in enumerate(custom):
                hid = get_or_create(cat, name)
                habit = db.get(Habit, hid)
                habit.sort_order = i

    completions_written = 0
    for key, day_data in hd.items():
        if not _ISO_DATE.match(key) or not isinstance(day_data, dict):
            continue
        for cat, entries in day_data.items():
            if cat not in _HABIT_CATEGORIES or not isinstance(entries, dict):
                continue
            for name, done in entries.items():
                habit_id = get_or_create(cat, name)
                existing = (
                    db.query(HabitCompletion)
                    .filter_by(habit_id=habit_id, day=key)
                    .first()
                )
                if existing is None:
                    db.add(HabitCompletion(habit_id=habit_id, day=key, done=bool(done)))
                    completions_written += 1
                else:
                    existing.done = bool(done)

    # __intention_/__win_/__reflection_<day> are DailyIntention's three
    # per-day text columns (see that model's own docstring) — same
    # get-or-create-by-day shape for all three, just a different column.
    # A local cache (rather than repeated db.get() calls) is needed
    # because all three prefixes commonly share the same day: a pending
    # (added-but-unflushed) row for "text" must be found and reused by
    # the very next "win"/"reflection" key for that same day, not
    # re-inserted as a second row with the same primary key.
    intentions_written = 0
    _DAY_TEXT_PREFIXES = (
        ("__intention_", "text"),
        ("__win_", "win"),
        ("__reflection_", "reflection"),
        # __mindset_<day> is the PLAN screen's Mindset note. It was
        # missing from this list, so every one of those notes was
        # silently dropped on import — the key isn't referenced anywhere
        # else, so nothing else would have caught it.
        ("__mindset_", "mindset"),
    )
    _intention_cache: dict[str, DailyIntention] = {}
    for key, text in hd.items():
        if not isinstance(text, str):
            continue
        for prefix, field in _DAY_TEXT_PREFIXES:
            if not key.startswith(prefix):
                continue
            day = key[len(prefix):]
            row = _intention_cache.get(day) or db.get(DailyIntention, day)
            if row is None:
                row = DailyIntention(day=day)
                db.add(row)
                _intention_cache[day] = row
            setattr(row, field, text)
            intentions_written += 1
            break

    habits_after = sum(len(m) for m in name_to_id.values())
    return {
        "habits_created": habits_after - habits_before,
        "completions_written": completions_written,
        "intentions_written": intentions_written,
    }


def import_projects(data: dict, db: Session) -> dict:
    """Reads vision_data[proj1..6] (title/note/detail_note/note_bg/note_fg
    /tasks) plus the project-related keys that live — despite the name —
    in habit_data: __consist_tgt_<key> (daily target minutes),
    __ptime_<key> (per-day timer seconds), __consist_mark_<key> (manual
    override marks), and __circle_<key> / __circle (accountability
    circle, project-specific or the legacy unassigned list).

    Must run before import_tasks: existing tasks' project/psrc columns
    are real foreign keys now, so the projects/subtasks they point at
    have to exist first (and be flushed, not just added) or those task
    inserts fail FK validation.
    """
    vd = data.get("vision_data", {})
    hd = data.get("habit_data", {})

    subtasks_written = 0
    for key in _PROJECT_KEYS:
        project = db.get(Project, key)
        if project is None:
            continue  # migration always seeds all 6; skip defensively
        pd = vd.get(key)
        if isinstance(pd, dict):
            project.name = pd.get("title", "") or ""
            project.note = pd.get("note", "") or ""
            project.detail_note = pd.get("detail_note", "") or ""
            project.note_title = vd.get(f"_qn_title_{project.key}", "") or ""
            project.note_bg = pd.get("note_bg") or None
            project.note_fg = pd.get("note_fg") or None
            for raw in pd.get("tasks", []):
                pid = raw.get("pid")
                if not pid:
                    continue
                sub = db.get(ProjectSubtask, pid)
                if sub is None:
                    db.add(ProjectSubtask(
                        pid=pid,
                        project_key=key,
                        text=raw.get("text", ""),
                        done=bool(raw.get("done", False)),
                        added_date=raw.get("added_date", ""),
                    ))
                    subtasks_written += 1
                else:
                    sub.text = raw.get("text", sub.text)
                    sub.done = bool(raw.get("done", sub.done))

        tgt = hd.get(f"__consist_tgt_{key}")
        if isinstance(tgt, (int, float)):
            project.target_minutes = max(5, int(tgt))

    # Flush before any Task rows (imported next) can reference these
    # projects/subtasks by FK.
    db.flush()

    activity_written = 0
    for key in _PROJECT_KEYS:
        secs_log = hd.get(f"__ptime_{key}")
        marks = hd.get(f"__consist_mark_{key}")
        days: set[str] = set()
        if isinstance(secs_log, dict):
            days |= set(secs_log.keys())
        if isinstance(marks, dict):
            days |= set(marks.keys())
        for day in days:
            if not _ISO_DATE.match(day):
                continue
            secs_val = float(secs_log.get(day, 0.0)) if isinstance(secs_log, dict) else 0.0
            mark_val = bool(marks.get(day, False)) if isinstance(marks, dict) else False
            row = (
                db.query(ProjectActivity)
                .filter_by(project_key=key, day=day)
                .first()
            )
            if row is None:
                db.add(ProjectActivity(
                    project_key=key, day=day, secs=secs_val, manual_mark=mark_val,
                ))
                activity_written += 1
            else:
                row.secs = secs_val
                row.manual_mark = mark_val

    people_written = 0
    circle_sources = [(f"__circle_{k}", k) for k in _PROJECT_KEYS] + [("__circle", None)]
    for hd_key, project_key in circle_sources:
        people = hd.get(hd_key)
        if not isinstance(people, list):
            continue
        for p in people:
            pid = p.get("id")
            if pid is None:
                continue
            person = db.get(CirclePerson, pid)
            if person is None:
                db.add(CirclePerson(
                    id=pid,
                    project_key=project_key,
                    name=p.get("name", ""),
                    cadence_days=int(p.get("cadence", 7)),
                    last_contact=p.get("last") or None,
                ))
                people_written += 1
            else:
                person.name = p.get("name", person.name)
                person.cadence_days = int(p.get("cadence", person.cadence_days))
                person.last_contact = p.get("last") or person.last_contact

    return {
        "project_subtasks_written": subtasks_written,
        "project_activity_days_written": activity_written,
        "circle_people_written": people_written,
    }


def import_business_analysis(data: dict, db: Session) -> dict:
    """Reads the current 5-section canvas (`ba_idea_*`/`ba_an_*`/`ba_fin_*`/
    `ba_decision_*`/`ba_next_*`), the decision log (`ba_decision_log`, a
    list of `{date, from, to, why}`), and the 15-box legacy freeform grid
    (`ba_box_0..14` + `ba_box_{n}_title`) out of each project's
    `vision_data` entry. The current-canvas fields overwrite on every run
    (they're a live 1:1 edit surface, same as Project name/note); the
    decision log and legacy boxes are append-only/archival so entries are
    only ever added, never rewritten, once present.
    """
    vd = data.get("vision_data", {})

    fields_written = log_entries_written = boxes_written = 0
    for key in _PROJECT_KEYS:
        pd = vd.get(key)
        if not isinstance(pd, dict):
            continue

        ba = db.get(BusinessAnalysis, key)
        if ba is not None:
            for field in _BA_TEXT_FIELDS:
                ba.__setattr__(field, pd.get(f"ba_{field}", "") or "")
            ba.decision_status = pd.get("ba_decision_status", "") or ""
            ba.next_priority = pd.get("ba_next_priority", "") or ""
            fields_written += 1

        existing_log = {
            (row.date, row.from_status, row.to_status, row.why)
            for row in db.query(DecisionLog).filter_by(project_key=key).all()
        }
        for entry in pd.get("ba_decision_log", []) or []:
            sig = (
                entry.get("date", ""),
                entry.get("from", ""),
                entry.get("to", ""),
                entry.get("why", ""),
            )
            if sig in existing_log:
                continue
            db.add(DecisionLog(
                project_key=key,
                date=sig[0],
                from_status=sig[1],
                to_status=sig[2],
                why=sig[3],
            ))
            existing_log.add(sig)
            log_entries_written += 1

        for i in range(15):
            text = pd.get(f"ba_box_{i}", "") or ""
            title = pd.get(f"ba_box_{i}_title", "") or ""
            box = (
                db.query(LegacyAnalysisBox)
                .filter_by(project_key=key, box_index=i)
                .first()
            )
            if box is None:
                db.add(LegacyAnalysisBox(project_key=key, box_index=i, title=title, text=text))
                boxes_written += 1
            else:
                box.title = title
                box.text = text

    return {
        "ba_projects_updated": fields_written,
        "ba_log_entries_written": log_entries_written,
        "ba_boxes_written": boxes_written,
    }


def import_goals(data: dict, db: Session) -> dict:
    """Reads `goals_by_project[proj_key][horizon]` (flattened here to
    Goal's `horizon` column, same split Task.list_key already applies).
    The flat top-level `yearly`/`monthly`/`weekly` lists are the
    currently-selected project's goals only — a strict subset of
    goals_by_project, which always wins when present — so they're never
    read here. Legacy's per-goal `day` field is dropped (see Goal's own
    docstring: nothing ever read it back)."""
    gbp = data.get("goals_by_project", {}) or {}
    written = 0
    for project_key, lists in gbp.items():
        if project_key not in _PROJECT_KEYS or not isinstance(lists, dict):
            continue
        for horizon in _GOAL_HORIZONS:
            for raw in lists.get(horizon, []) or []:
                gid = raw.get("id")
                if gid is None:
                    continue
                goal = db.get(Goal, gid)
                if goal is None:
                    db.add(Goal(
                        id=gid,
                        project_key=project_key,
                        horizon=horizon,
                        text=raw.get("text", ""),
                        done=bool(raw.get("done", False)),
                        start_date=raw.get("start_date", "") or "",
                        done_date=raw.get("done_date") or None,
                        note=raw.get("note", "") or "",
                    ))
                    written += 1
                else:
                    goal.text = raw.get("text", goal.text)
                    goal.done = bool(raw.get("done", goal.done))
                    goal.done_date = raw.get("done_date") or goal.done_date
                    goal.note = raw.get("note", goal.note)
    return {"goals_written": written}


def import_journey(data: dict, db: Session) -> dict:
    """Reads `habit_data["__journey_<key>"]` — Product Journey lives
    there, not in vision_data, because vision_data's save_data()/
    clean_vision() only persists a fixed per-project key whitelist (see
    the legacy app's own `_open_project_journey` docstring). Tasks and
    log entries carry no id of their own in the legacy shape (plain
    `{"text","done"}` / `{"t","d","s"}` dicts, appended in place) so
    they're deduped by content on re-run instead of by id, same
    trade-off `import_business_analysis` already accepts for its
    decision log."""
    hd = data.get("habit_data", {}) or {}
    vd = data.get("vision_data", {}) or {}
    stages_written = tasks_written = logs_written = 0

    for key in _PROJECT_KEYS:
        jd = hd.get(f"__journey_{key}")
        if not isinstance(jd, dict):
            continue

        journey = db.get(ProjectJourney, key)
        if journey is None:
            continue  # migration always seeds all 6; skip defensively
        pd = vd.get(key) if isinstance(vd.get(key), dict) else {}
        journey.proj_name = jd.get("proj_name") or pd.get("title", "") or ""
        journey.tagline = jd.get("tagline") or journey.tagline
        journey.cover_image = jd.get("cover_image", "") or ""
        journey.attach_file = jd.get("attach_file", "") or ""

        names = jd.get("names") or []
        descs = jd.get("descs") or []
        gates = jd.get("gates") or []
        gate_done = jd.get("gate_done") or []
        tasks_by_stage = jd.get("tasks") or []
        logs_by_stage = jd.get("logs") or []
        n = max(len(names), len(JOURNEY_STAGES))

        for i in range(n):
            default_name, default_desc = JOURNEY_STAGES[i] if i < len(JOURNEY_STAGES) else ("", "")
            name = (names[i] if i < len(names) else "") or default_name
            desc = descs[i] if i < len(descs) else default_desc
            gate = gates[i] if i < len(gates) else ""
            gdone = bool(gate_done[i]) if i < len(gate_done) else False

            stage = db.query(JourneyStage).filter_by(project_key=key, stage_index=i).first()
            if stage is None:
                db.add(JourneyStage(
                    project_key=key, stage_index=i, name=name,
                    description=desc or "", gate=gate, gate_done=gdone,
                ))
                stages_written += 1
            else:
                stage.name = name
                stage.description = desc
                stage.gate = gate
                stage.gate_done = gdone

            existing_texts = {
                t.text for t in db.query(JourneyTask).filter_by(project_key=key, stage_index=i).all()
            }
            for raw in (tasks_by_stage[i] if i < len(tasks_by_stage) else []) or []:
                text = raw.get("text", "")
                if not text or text in existing_texts:
                    continue
                db.add(JourneyTask(
                    id=_next_synthetic_id(), project_key=key, stage_index=i,
                    text=text, done=bool(raw.get("done", False)),
                ))
                existing_texts.add(text)
                tasks_written += 1

            existing_logs = {
                (log.text, log.date, log.status)
                for log in db.query(JourneyLogEntry).filter_by(project_key=key, stage_index=i).all()
            }
            for raw in (logs_by_stage[i] if i < len(logs_by_stage) else []) or []:
                sig = (raw.get("t", ""), raw.get("d", ""), raw.get("s", ""))
                if not sig[0] or sig in existing_logs:
                    continue
                db.add(JourneyLogEntry(
                    id=_next_synthetic_id(), project_key=key, stage_index=i,
                    text=sig[0], date=sig[1], status=sig[2],
                ))
                existing_logs.add(sig)
                logs_written += 1

    return {
        "journey_stages_written": stages_written,
        "journey_tasks_written": tasks_written,
        "journey_logs_written": logs_written,
    }


def import_bdp(data: dict, db: Session) -> dict:
    """Reads the top-level `bdp_data` key — a dedicated escape hatch
    save_data() writes alongside `vision_data["self_dev"]` specifically
    because clean_vision()'s whitelist would otherwise drop the whole
    `plans` list (see that function's dict-branch: only title/note/
    tasks/box*/ba_* survive it, `self_dev` matches none of those). Each
    plan's `next_actions` are a bare `{"text","done"}` list like
    Journey's own tasks — same synthetic-id + dedupe-by-text handling."""
    bdp = data.get("bdp_data", {}) or {}
    plans_written = actions_written = 0

    # New plans sort ABOVE whatever is already in the table (e.g. the
    # port's own seeded example cards) rather than colliding with their
    # order values — a real user's imported data outranks placeholder
    # content, and BdpPlan.order's own docstring already establishes
    # "min(existing) - 1.0" as how a new plan goes to the top.
    existing_min = db.query(BdpPlan.order).order_by(BdpPlan.order.asc()).first()
    next_order = (existing_min[0] if existing_min else 0.0) - len(bdp.get("plans", []) or [])

    for i, raw in enumerate(bdp.get("plans", []) or []):
        pid = raw.get("id")
        if pid is None:
            continue
        plan = db.get(BdpPlan, pid)
        if plan is None:
            plan = BdpPlan(id=pid, title=raw.get("title", ""), order=next_order + i)
            db.add(plan)
            db.flush()  # BdpAction rows below reference plan_id by FK
            plans_written += 1
        plan.title = raw.get("title", plan.title)
        plan.status = raw.get("status") or plan.status or "IDEA"
        plan.priority = raw.get("priority") or plan.priority or "MEDIUM"
        plan.opportunity = raw.get("opportunity", "") or ""
        plan.market = raw.get("market", "") or ""
        plan.target = raw.get("target", "") or ""
        plan.niche = raw.get("niche", "") or ""
        plan.model = raw.get("model", "") or ""
        plan.product = raw.get("product", "") or ""
        plan.service = raw.get("service", "") or ""
        plan.supplier = raw.get("supplier", "") or ""
        plan.timeline = raw.get("timeline", "") or ""
        plan.potential = int(raw.get("potential") or plan.potential or 3)
        plan.difficulty = int(raw.get("difficulty") or plan.difficulty or 3)
        plan.cost_amount = raw.get("cost_amount", "") or ""
        plan.yearly_profit = raw.get("yearly_profit", "") or ""
        plan.notes = raw.get("notes", "") or ""
        plan.archived = bool(raw.get("archived", False))
        plan.created = raw.get("created", "") or plan.created
        plan.updated = raw.get("updated", "") or plan.updated

        existing_texts = {a.text for a in db.query(BdpAction).filter_by(plan_id=pid).all()}
        for order, raw_action in enumerate(raw.get("next_actions", []) or []):
            text = raw_action.get("text", "")
            if not text or text in existing_texts:
                continue
            db.add(BdpAction(
                id=_next_synthetic_id(), plan_id=pid, text=text,
                done=bool(raw_action.get("done", False)),
                sort_order=len(existing_texts) + order,
            ))
            existing_texts.add(text)
            actions_written += 1

    return {"bdp_plans_written": plans_written, "bdp_actions_written": actions_written}


def import_quarterly(data: dict, db: Session) -> dict:
    """Reads `habit_data["__q90_<cycle-start>"]` — `{area: {out, act,
    ifthen}}` per cycle. Flattened to one QuarterlyAnswer row per
    (cycle_start, area), same reasoning Goal already applies to its
    horizon split."""
    hd = data.get("habit_data", {}) or {}
    written = 0
    for key, val in hd.items():
        if not key.startswith("__q90_") or not isinstance(val, dict):
            continue
        cycle_start = key[len("__q90_"):]
        for area, fields in val.items():
            if not isinstance(fields, dict):
                continue
            row = db.query(QuarterlyAnswer).filter_by(cycle_start=cycle_start, area=area).first()
            if row is None:
                db.add(QuarterlyAnswer(
                    cycle_start=cycle_start, area=area,
                    out=fields.get("out", "") or "",
                    act=fields.get("act", "") or "",
                    ifthen=fields.get("ifthen", "") or "",
                ))
                written += 1
            else:
                row.out = fields.get("out", row.out)
                row.act = fields.get("act", row.act)
                row.ifthen = fields.get("ifthen", row.ifthen)
    return {"quarterly_answers_written": written}


def import_settings(data: dict, db: Session) -> dict:
    """Reads the top-level `settings` dict (legacy's own `self._settings`
    — see AppState's docstring for the full field-by-field mapping this
    mirrors), plus the handful of settings-shaped values legacy keeps
    OUTSIDE that dict: `theme`/`onboarded`/`goal_project` at the save
    payload's top level, section/task-list headings inside
    `vision_data`'s underscore-prefixed keys (the one place
    clean_vision's whitelist explicitly preserves them), and BDP's sort
    mode inside `bdp_data`. Only themes the port actually ships
    (`_VALID_THEMES`) are applied — legacy's retired Executive/Rize
    values fall back to AppState's own default rather than being stored
    unusable."""
    st = data.get("settings", {}) or {}
    vd = data.get("vision_data", {}) or {}
    bdp = data.get("bdp_data", {}) or {}

    app_state = db.get(AppState, 1)
    if app_state is None:
        app_state = AppState(id=1)
        db.add(app_state)

    theme = data.get("theme")
    if theme in _VALID_THEMES:
        app_state.theme = theme
    app_state.onboarded = bool(data.get("onboarded", app_state.onboarded))
    goal_project = data.get("goal_project")
    if goal_project in _PROJECT_KEYS:
        app_state.goal_project = goal_project

    if "lang" in st:
        app_state.lang = st["lang"]
    if "currency" in st:
        app_state.currency = st["currency"]
    if "goal_hours" in st:
        app_state.goal_hours = int(st["goal_hours"])
    if "analog_clock" in st:
        app_state.analog_clock = bool(st["analog_clock"])
    if "auto_timer_on_open" in st:
        app_state.auto_timer_on_open = bool(st["auto_timer_on_open"])
    if "idle_stop_min" in st:
        app_state.idle_stop_min = int(st["idle_stop_min"])
    if "trend_days" in st:
        app_state.trend_days = int(st["trend_days"])
    if st.get("cycle_start"):
        app_state.q90_cycle_start = st["cycle_start"]
    if "cycle_days" in st:
        app_state.q90_cycle_days = int(st["cycle_days"])
    if st.get("mit_prompt_date"):
        app_state.mit_prompt_date = st["mit_prompt_date"]
    if st.get("task_day") in ("today", "tomorrow"):
        app_state.task_day_view = st["task_day"]
    for field in ("phase_morning_start", "phase_work_start", "phase_evening_start", "phase_sleep_start"):
        if field in st:
            setattr(app_state, field, int(st[field]))

    sec_yearly = vd.get("_sec_title_yearly") or data.get("sec_title_yearly")
    if sec_yearly:
        app_state.sec_title_yearly = sec_yearly
    sec_monthly = vd.get("_sec_title_monthly") or data.get("sec_title_monthly")
    if sec_monthly:
        app_state.sec_title_monthly = sec_monthly
    sec_weekly = vd.get("_sec_title_weekly") or data.get("sec_title_weekly")
    if sec_weekly:
        app_state.sec_title_weekly = sec_weekly

    task_title_today = vd.get("_task_title") or data.get("task_title")
    if task_title_today:
        app_state.task_title_classic_today = task_title_today
    if vd.get("_task_title_tomorrow"):
        app_state.task_title_classic_tomorrow = vd["_task_title_tomorrow"]
    if vd.get("_task_title_focus"):
        app_state.task_title_focus_today = vd["_task_title_focus"]
    if vd.get("_task_title_focus_tomorrow"):
        app_state.task_title_focus_tomorrow = vd["_task_title_focus_tomorrow"]

    if bdp.get("sort") in ("manual", "priority"):
        app_state.bdp_sort = bdp["sort"]

    return {"settings_imported": True}


def import_file(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    db = SessionLocal()
    try:
        project_stats = import_projects(data, db)
        tasks_imported, tasks_skipped = import_tasks(data, db)
        habit_stats = import_habits(data, db)
        ba_stats = import_business_analysis(data, db)
        goal_stats = import_goals(data, db)
        journey_stats = import_journey(data, db)
        bdp_stats = import_bdp(data, db)
        quarterly_stats = import_quarterly(data, db)
        settings_stats = import_settings(data, db)
        db.commit()
    finally:
        db.close()

    return {
        "tasks_imported": tasks_imported,
        "tasks_skipped": tasks_skipped,
        **habit_stats,
        **project_stats,
        **ba_stats,
        **goal_stats,
        **journey_stats,
        **bdp_stats,
        **quarterly_stats,
        **settings_stats,
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m database.import_legacy /path/to/.task_tracker_v6.json")
        sys.exit(1)
    stats = import_file(sys.argv[1])
    print(
        f"Projects: wrote {stats['project_subtasks_written']} subtask(s), "
        f"{stats['project_activity_days_written']} activity day(s), "
        f"{stats['circle_people_written']} circle contact(s).\n"
        f"Tasks: imported {stats['tasks_imported']}, skipped {stats['tasks_skipped']} already-present.\n"
        f"Habits: created {stats['habits_created']} new habit(s), "
        f"wrote {stats['completions_written']} completion(s), "
        f"{stats['intentions_written']} intention(s).\n"
        f"Business analysis: updated {stats['ba_projects_updated']} project(s), "
        f"wrote {stats['ba_log_entries_written']} decision log entr(y/ies), "
        f"{stats['ba_boxes_written']} new legacy box(es).\n"
        f"Goals: wrote {stats['goals_written']} goal(s).\n"
        f"Journey: wrote {stats['journey_stages_written']} stage(s), "
        f"{stats['journey_tasks_written']} task(s), "
        f"{stats['journey_logs_written']} log entr(y/ies).\n"
        f"Business Plan Notes: wrote {stats['bdp_plans_written']} plan(s), "
        f"{stats['bdp_actions_written']} action(s).\n"
        f"Quarterly Plan: wrote {stats['quarterly_answers_written']} answer row(s).\n"
        f"Settings: imported."
    )
