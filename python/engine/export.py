import csv
import io
from datetime import datetime

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from database.models import (
    AppState,
    BusinessAnalysis,
    CirclePerson,
    DailyIntention,
    DecisionLog,
    Goal,
    Habit,
    HabitCompletion,
    LegacyAnalysisBox,
    Project,
    ProjectActivity,
    ProjectSubtask,
    Task,
)

SCHEMA_VERSION = 1

# Explicit, not auto-discovered from the ORM registry: a backup should
# only grow to cover a new table when someone deliberately adds it
# here, not silently the moment a new model class exists somewhere.
_EXPORTED_TABLES = [
    ("tasks", Task),
    ("habits", Habit),
    ("habit_completions", HabitCompletion),
    ("daily_intentions", DailyIntention),
    ("projects", Project),
    ("project_subtasks", ProjectSubtask),
    ("project_activity", ProjectActivity),
    ("circle_people", CirclePerson),
    ("business_analysis", BusinessAnalysis),
    ("decision_log", DecisionLog),
    ("legacy_analysis_boxes", LegacyAnalysisBox),
    ("goals", Goal),
    ("app_state", AppState),
]


def _row_to_dict(row) -> dict:
    """Every column on the row, generically — not a hand-maintained
    per-table field list. A backup exists to be complete; a field list
    someone forgets to update when a column is added later would fail
    silently, which is exactly the kind of drift a backup must not
    have (see BusinessAnalysis's own docstring for a real instance of
    that happening to the legacy app's single-blob approach)."""
    return {c.key: getattr(row, c.key) for c in inspect(row).mapper.column_attrs}


def build_backup(db: Session) -> dict:
    """Full JSON-able snapshot of every persisted table. The legacy
    app's "JSON backup" was a literal copy of its one save-file, since
    its entire state WAS one JSON blob. This port has no equivalent
    single file — real tables instead — so this assembles the same
    completeness by dumping all of them under one versioned envelope.
    `schema_version` costs nothing to include now and is what would
    let a future restore/import feature detect an old backup's shape
    instead of guessing, unlike the legacy app's several silent
    one-time field-migration hacks (see BusinessAnalysis, row 119)."""
    tables = {name: [_row_to_dict(r) for r in db.scalars(select(model)).all()] for name, model in _EXPORTED_TABLES}
    return {
        "schema_version": SCHEMA_VERSION,
        "exported_at": datetime.now().isoformat(timespec="seconds"),
        "tables": tables,
    }


def build_csv(db: Session) -> str:
    """Task rows (matches the legacy export's columns exactly) plus a
    per-day activity summary row.

    Legacy's day rows came from `_daily_history`, a global snapshot
    dict this port never carries forward (nothing populates it — see
    FEATURE_INVENTORY.md row 167). Reconstructed here from data the
    port already tracks accurately instead of adding new tracking
    infrastructure just for this export:
      - `seconds`: the true sum of every project's logged time for
        that day (ProjectActivity) — more accurate than legacy's
        figure, which could drift from whatever `progress_secs`
        happened to hold at rollover.
      - `done`: count of tasks whose `day` is that date AND are
        marked done. Not quite legacy's exact semantics (a same-day
        snapshot of "how many tasks are done right now, across all
        history") — this is "tasks scheduled for day D that ended up
        done", which the port CAN answer accurately from Task.day,
        unlike a true "completed on day D" count (no completion
        timestamp is tracked; adding one is a separate, bigger change
        than this export needs).
    """
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["type", "date", "text", "done", "seconds", "estimate_min", "mit"])

    tasks = db.scalars(select(Task)).all()
    for t in tasks:
        writer.writerow([f"task_{t.list_key}", t.day, t.text, t.done, int(t.secs), t.est, t.mit])

    secs_by_day: dict[str, float] = {}
    for a in db.scalars(select(ProjectActivity)).all():
        secs_by_day[a.day] = secs_by_day.get(a.day, 0.0) + a.secs

    done_by_day: dict[str, int] = {}
    for t in tasks:
        if t.done:
            done_by_day[t.day] = done_by_day.get(t.day, 0) + 1

    for d in sorted(set(secs_by_day) | set(done_by_day)):
        writer.writerow(["day", d, "", "", int(secs_by_day.get(d, 0)), "", done_by_day.get(d, 0)])

    return buf.getvalue()
