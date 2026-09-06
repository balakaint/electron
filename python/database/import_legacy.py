"""One-off importer: pulls Tasks and Habits data out of the legacy
Tkinter app's JSON blob (~/.task_tracker_v6.json) and inserts it into the
new SQLite tables. Idempotent — safe to re-run after the legacy app has
recorded more data.

Usage:
    python -m database.import_legacy /path/to/.task_tracker_v6.json
"""

import json
import re
import sys

from sqlalchemy.orm import Session

from database.connection import SessionLocal
from database.models import (
    BusinessAnalysis,
    CirclePerson,
    DailyIntention,
    DecisionLog,
    Habit,
    HabitCompletion,
    LegacyAnalysisBox,
    Project,
    ProjectActivity,
    ProjectSubtask,
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

    intentions_written = 0
    for key, text in hd.items():
        if key.startswith("__intention_") and isinstance(text, str):
            day = key[len("__intention_"):]
            row = db.get(DailyIntention, day)
            if row is None:
                db.add(DailyIntention(day=day, text=text))
            else:
                row.text = text
            intentions_written += 1

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


def import_file(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    db = SessionLocal()
    try:
        project_stats = import_projects(data, db)
        tasks_imported, tasks_skipped = import_tasks(data, db)
        habit_stats = import_habits(data, db)
        ba_stats = import_business_analysis(data, db)
        db.commit()
    finally:
        db.close()

    return {
        "tasks_imported": tasks_imported,
        "tasks_skipped": tasks_skipped,
        **habit_stats,
        **project_stats,
        **ba_stats,
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
        f"{stats['ba_boxes_written']} new legacy box(es)."
    )
