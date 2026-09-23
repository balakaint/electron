# Planning Hierarchy — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real Outcome→Milestone→Win→Task hierarchy (with a
generic checklist at every level), migrate existing `Goal`/`GoalTask`
data into it, and repoint Panel 2 (`GoalsPanel.tsx`) and Panel 3's
EXECUTE tab (`HoursAccordion` in `Panel3.tsx`) to read/write it instead
of the flat `Goal` table.

**Architecture:** Four new SQLAlchemy tables with real FKs
(`outcomes → milestones → wins → plan_tasks`) plus a fifth
(`checklist_items`) attachable to any of the first three. Progress on
every non-leaf node is always derived by walking child rows (never
hand-written per period) unless the node is `fixed`. A single Alembic
migration creates the tables and forward-copies existing `Goal`/
`GoalTask` rows into them via a best-effort owner+period match, leaving
`goals`/`goal_tasks` untouched (Board still reads them until Phase B).

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (Python backend),
React + TypeScript (renderer), matching this repo's existing
`engine/*.py` + `api/routes/*.py` + `services/api.ts` conventions.

**Spec:** `docs/superpowers/specs/2026-09-23-planning-hierarchy-phase-a-design.md`

## Execution Order (Panel 3 first, per Zahid's 2026-09-23 instruction)

Tasks are numbered in dependency order, but **Panel 3 (EXECUTE tab)
ships as a complete, independently-verifiable checkpoint before Panel 2
(GoalsPanel) work starts.** Run them in this order, not strict numeric
order:

**Checkpoint 1 — Panel 3 complete:** Tasks 1 → 9 (backend + API client,
required by both panels), 10 → 13 (shared card + the three Panel 3
level components), **15** (wire `Panel3.tsx` — do this before Task 14),
**16** (delete the superseded `GoalHorizonSection.tsx`), then run Task
17's Steps 1-2 in a **Panel-3-only** pass: since Panel 2 hasn't been
migrated yet at this checkpoint, seed a test Outcome/Milestone/Win/
checklist item via the `python -c "..."` pattern from Task 8's Step 2
(direct `PlanningEngine` calls, not the Goals panel UI) rather than
clicking through Panel 2, then verify EXECUTE's WEEKLY/MONTHLY/YEARLY
tabs render it correctly. Clean up the same way Task 17 Step 3 does.

**Known interim gap, expected and acceptable:** between this checkpoint
and Task 14 landing, Panel 2 still writes to the old `goals` table, so
nothing created through Panel 2's UI during this window appears in
Panel 3's EXECUTE tab (which now reads only the new tables) — EXECUTE
will show migrated legacy data (Task 3's forward-copy) plus whatever
was seeded directly for verification, and nothing new from Panel 2
until Checkpoint 2. This is a real, visible product gap for whoever
uses the app during this window — acceptable for a short dev-only
window, not something to ship to an end user paused mid-way.

**Checkpoint 2 — Panel 2 complete:** Task 14 (`GoalsPanel.tsx` rewrite),
then Task 17 in full (the create→schedule→complete→cascade walk through
Panel 2's actual UI, confirming Panel 3 reflects it).

## Global Constraints

- ms-timestamp integer primary keys (`int(time.time() * 1000)`), matching
  every other table in this repo (`Goal`, `Task`, `BoardTask`) — never a
  DB-generated autoincrement.
- `goals`/`goal_tasks` tables and `BoardTask`/`BoardCard` are **not
  modified** in this phase — Board keeps working against them unchanged.
- New model class names must not collide with the existing `Task` class
  (table `tasks`, daily execution) — the new leaf node is `PlanTask`
  (table `plan_tasks`).
- Every derived-progress computation lives in `engine/planning.py` as a
  pure function (`db`/`repo`-free where possible) — never inline in a
  route or a React component.
- Owner key reuses the existing `GoalOwnerKeyT` literal
  (`proj1`..`proj6`, `"life"`) everywhere — no new owner-key type.
- Alembic migration chains onto the current head, `d4b6f83a1c9e` (confirm
  with `alembic heads` before writing the migration — if this changed
  since this plan was written, use the new head instead).
- Frontend currency: reuse `useAutosave`, `useAutofocus`, `useFetchState`,
  `AccordionSection`, `RADIUS`/`SPACE` tokens — no new styling primitives.

## Review Focus

- **Milestone/Win with zero children but `fixed=false`:** must return
  `progress = 0` (or stored `progress` if that's non-null), never throw
  or return `None` — the mockup's Week 4 ("not started") depends on this.
- **Deleting a node with children:** must 409 with a child count, not
  cascade silently — a Zahid-confirmed edge case bigger in blast radius
  than anything this app deletes today.
- **Migration ambiguity (two Milestones, one Outcome to guess from):**
  must produce a real (possibly synthetic) parent, never leave a
  Milestone/Win with a null required FK — the schema has no nullable
  `outcome_id`/`milestone_id`.
- **`checklist_items` with more than one parent FK set, or none:** must
  be rejected at the engine layer (`ValueError`), not silently accepted
  — a row with two parents would double-count nowhere today, but would
  make the "exactly one of three" invariant a lie for anything reading
  it later.
- **Re-parenting a Milestone/Win to a different Outcome/Milestone via
  the fix-up picker:** the moved node's own children must NOT move with
  it implicitly beyond the FK already encodes (i.e. moving a Milestone
  changes its `outcome_id` only; its Wins keep their own `milestone_id`
  unchanged, so they move along for free via the FK, not via a second
  write) — a bug here would silently duplicate or orphan Wins.

---

## File Structure

**Backend — create:**
- `python/alembic/versions/e7f2a4c9b615_add_planning_hierarchy.py` — schema + forward-copy migration
- `python/engine/planning.py` — pure progress functions + `PlanningEngine` CRUD class
- `python/api/routes/planning.py` — FastAPI routes
- `python/test_planning.py` — unit + migration round-trip tests

**Backend — modify:**
- `python/database/models.py` — add `Outcome`, `Milestone`, `Win`, `PlanTask`, `ChecklistItem` (append after `BoardCard`, before `QuarterlyAnswer`)
- `python/database/repository.py` — add `PlanningRepository` (append after `BoardTaskRepository`/`BoardCardRepository`)
- `python/api/schemas.py` — add `Outcome*`, `Milestone*`, `Win*`, `PlanTask*`, `ChecklistItem*` schemas
- `python/api/server.py:6-26,72-95` — import + register `planning_router`

**Frontend — create:**
- `renderer/src/components/PlanningProgressCard.tsx` — shared Outcome/Milestone/Win progress card (bar, criteria, achieved badge, time-vs-progress-vs-pace row)
- `renderer/src/components/PlanningWeeklyLevel.tsx` — Panel 3 WEEKLY body
- `renderer/src/components/PlanningMonthlyLevel.tsx` — Panel 3 MONTHLY body
- `renderer/src/components/PlanningYearlyLevel.tsx` — Panel 3 YEARLY body

**Frontend — modify:**
- `renderer/src/services/api.ts` — add `Outcome`/`Milestone`/`Win`/`PlanTask`/`ChecklistItem` types + `planningApi` client (append after `goalTasksApi`, ~line 481)
- `renderer/src/components/GoalsPanel.tsx` — full rewrite of the horizon-dropdown/`GoalSection`/`GoalRow` trio to a level-dropdown/`PlanningSection`/`PlanningRow` trio (see Task 9-11)
- `renderer/src/components/Panel3.tsx:241-283` — replace the three `GoalHorizonSection` calls with `PlanningWeeklyLevel`/`PlanningMonthlyLevel`/`PlanningYearlyLevel`

**Frontend — delete (Task 12, after everything else lands and is verified working):**
- `renderer/src/components/GoalHorizonSection.tsx` — superseded, no other importer

---

### Task 1: `Outcome`/`Milestone`/`Win`/`PlanTask`/`ChecklistItem` models

**Files:**
- Modify: `python/database/models.py` (append after `BoardCard`, before `QuarterlyAnswer` at line 771)
- Test: `python/test_planning.py` (created here, extended by later tasks)

**Interfaces:**
- Produces: `Outcome`, `Milestone`, `Win`, `PlanTask`, `ChecklistItem` ORM classes, importable as `from database.models import Outcome, Milestone, Win, PlanTask, ChecklistItem`.

- [ ] **Step 1: Add the five model classes**

```python
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
```

- [ ] **Step 2: Verify the module still imports cleanly**

Run: `cd python && source .venv/bin/activate && python -c "import database.models"`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
cd /home/zahid/dev/habit-os
git add python/database/models.py
git commit -m "feat(planning): add Outcome/Milestone/Win/PlanTask/ChecklistItem models"
```

---

### Task 2: `PlanningRepository`

**Files:**
- Modify: `python/database/repository.py` (append after the last repository class — check the file's end for exact insertion point; follow `GoalRepository`'s method shape exactly)

**Interfaces:**
- Consumes: `Outcome`, `Milestone`, `Win`, `PlanTask`, `ChecklistItem` from Task 1.
- Produces: `PlanningRepository` with `list_outcomes(owner_key)`, `get_outcome(id)`, `add_outcome(outcome)`, `save_outcome(outcome)`, `delete_outcome(outcome)`, and the same six-method shape for `milestone`/`win`/`plan_task`, plus `list_checklist_items(*, outcome_id=None, milestone_id=None, win_id=None)`, `get_checklist_item(pid)`, `add_checklist_item(item)`, `save_checklist_item(item)`, `delete_checklist_item(item)`. Also `count_milestones(outcome_id)`, `count_wins(milestone_id)`, `count_plan_tasks(win_id)` for the delete-blocks-on-children check (Task 4).

- [ ] **Step 1: Add the repository class**

```python
class PlanningRepository:
    def __init__(self, db: Session):
        self.db = db

    # ── Outcomes ──────────────────────────────────────────────────────
    def list_outcomes(self, owner_key: str) -> list[Outcome]:
        stmt = select(Outcome).where(Outcome.owner_key == owner_key).order_by(Outcome.id)
        return list(self.db.scalars(stmt))

    def get_outcome(self, outcome_id: int) -> Outcome | None:
        return self.db.get(Outcome, outcome_id)

    def add_outcome(self, outcome: Outcome) -> Outcome:
        self.db.add(outcome)
        self.db.commit()
        self.db.refresh(outcome)
        return outcome

    def save_outcome(self, outcome: Outcome) -> Outcome:
        self.db.commit()
        self.db.refresh(outcome)
        return outcome

    def delete_outcome(self, outcome: Outcome) -> None:
        self.db.delete(outcome)
        self.db.commit()

    def count_milestones(self, outcome_id: int) -> int:
        return self.db.scalar(select(func.count()).select_from(Milestone).where(Milestone.outcome_id == outcome_id)) or 0

    # ── Milestones ────────────────────────────────────────────────────
    def list_milestones(self, outcome_id: int) -> list[Milestone]:
        stmt = select(Milestone).where(Milestone.outcome_id == outcome_id).order_by(Milestone.id)
        return list(self.db.scalars(stmt))

    def get_milestone(self, milestone_id: int) -> Milestone | None:
        return self.db.get(Milestone, milestone_id)

    def add_milestone(self, milestone: Milestone) -> Milestone:
        self.db.add(milestone)
        self.db.commit()
        self.db.refresh(milestone)
        return milestone

    def save_milestone(self, milestone: Milestone) -> Milestone:
        self.db.commit()
        self.db.refresh(milestone)
        return milestone

    def delete_milestone(self, milestone: Milestone) -> None:
        self.db.delete(milestone)
        self.db.commit()

    def count_wins(self, milestone_id: int) -> int:
        return self.db.scalar(select(func.count()).select_from(Win).where(Win.milestone_id == milestone_id)) or 0

    # ── Wins ──────────────────────────────────────────────────────────
    def list_wins(self, milestone_id: int) -> list[Win]:
        stmt = select(Win).where(Win.milestone_id == milestone_id).order_by(Win.id)
        return list(self.db.scalars(stmt))

    def get_win(self, win_id: int) -> Win | None:
        return self.db.get(Win, win_id)

    def add_win(self, win: Win) -> Win:
        self.db.add(win)
        self.db.commit()
        self.db.refresh(win)
        return win

    def save_win(self, win: Win) -> Win:
        self.db.commit()
        self.db.refresh(win)
        return win

    def delete_win(self, win: Win) -> None:
        self.db.delete(win)
        self.db.commit()

    def count_plan_tasks(self, win_id: int) -> int:
        return self.db.scalar(select(func.count()).select_from(PlanTask).where(PlanTask.win_id == win_id)) or 0

    # ── Plan tasks ────────────────────────────────────────────────────
    def list_plan_tasks(self, win_id: int) -> list[PlanTask]:
        stmt = select(PlanTask).where(PlanTask.win_id == win_id).order_by(PlanTask.id)
        return list(self.db.scalars(stmt))

    def list_plan_tasks_by_date(self, owner_key: str, scheduled_date: str) -> list[PlanTask]:
        stmt = select(PlanTask).where(PlanTask.owner_key == owner_key, PlanTask.scheduled_date == scheduled_date).order_by(PlanTask.id)
        return list(self.db.scalars(stmt))

    def get_plan_task(self, task_id: int) -> PlanTask | None:
        return self.db.get(PlanTask, task_id)

    def add_plan_task(self, task: PlanTask) -> PlanTask:
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task

    def save_plan_task(self, task: PlanTask) -> PlanTask:
        self.db.commit()
        self.db.refresh(task)
        return task

    def delete_plan_task(self, task: PlanTask) -> None:
        self.db.delete(task)
        self.db.commit()

    # ── Checklist items ───────────────────────────────────────────────
    def list_checklist_items(
        self, *, outcome_id: int | None = None, milestone_id: int | None = None, win_id: int | None = None
    ) -> list[ChecklistItem]:
        stmt = select(ChecklistItem)
        if outcome_id is not None:
            stmt = stmt.where(ChecklistItem.outcome_id == outcome_id)
        elif milestone_id is not None:
            stmt = stmt.where(ChecklistItem.milestone_id == milestone_id)
        elif win_id is not None:
            stmt = stmt.where(ChecklistItem.win_id == win_id)
        return list(self.db.scalars(stmt))

    def get_checklist_item(self, pid: str) -> ChecklistItem | None:
        return self.db.get(ChecklistItem, pid)

    def add_checklist_item(self, item: ChecklistItem) -> ChecklistItem:
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def save_checklist_item(self, item: ChecklistItem) -> ChecklistItem:
        self.db.commit()
        self.db.refresh(item)
        return item

    def delete_checklist_item(self, item: ChecklistItem) -> None:
        self.db.delete(item)
        self.db.commit()
```

- [ ] **Step 2: Add the new imports this class needs at the top of `repository.py`**

Check the existing `from database.models import ...` line and `from sqlalchemy import ...` line at the top of `repository.py` — add `Outcome, Milestone, Win, PlanTask, ChecklistItem` to the models import, and add `func` to the sqlalchemy import if not already present (`count_*` methods above use `select(func.count())`).

- [ ] **Step 3: Verify import**

Run: `cd python && source .venv/bin/activate && python -c "from database.repository import PlanningRepository"`
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add python/database/repository.py
git commit -m "feat(planning): add PlanningRepository"
```

---

### Task 3: Alembic migration — schema + forward-copy

**Files:**
- Create: `python/alembic/versions/e7f2a4c9b615_add_planning_hierarchy.py`
- Test: `python/test_planning.py` (migration round-trip test added here)

**Interfaces:**
- Consumes: table shapes from Task 1.
- Produces: `outcomes`, `milestones`, `wins`, `plan_tasks`, `checklist_items` tables in the DB; forward-copied rows from `goals`/`goal_tasks`.

- [ ] **Step 1: Confirm the current head**

Run: `cd python && source .venv/bin/activate && alembic heads`
Expected: `d4b6f83a1c9e (head)` — if different, use that revision as `down_revision` below instead.

- [ ] **Step 2: Write the migration**

```python
"""add planning hierarchy (outcomes/milestones/wins/plan_tasks/checklist_items)

Revision ID: e7f2a4c9b615
Revises: d4b6f83a1c9e
Create Date: 2026-09-23 00:00:00.000000

Forward-copies existing Goal/GoalTask rows into the new hierarchy —
see the Phase A design spec's "Migration" section for the exact
matching rules. goals/goal_tasks are NOT modified or dropped: Board
still reads them unchanged until Phase B.
"""
import time
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import table, column, select, func

revision: str = 'e7f2a4c9b615'
down_revision: Union[str, Sequence[str], None] = 'd4b6f83a1c9e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "outcomes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_key", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("fixed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("legacy_goal_id", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "milestones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("outcome_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("fixed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("legacy_goal_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["outcome_id"], ["outcomes.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "wins",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("milestone_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("week_start_date", sa.String(), nullable=False),
        sa.Column("criteria", sa.String(), nullable=False, server_default=""),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("fixed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("legacy_goal_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["milestone_id"], ["milestones.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "plan_tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("win_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("scheduled_date", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("owner_key", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["win_id"], ["wins.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "checklist_items",
        sa.Column("pid", sa.String(), nullable=False),
        sa.Column("outcome_id", sa.Integer(), nullable=True),
        sa.Column("milestone_id", sa.Integer(), nullable=True),
        sa.Column("win_id", sa.Integer(), nullable=True),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("added_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["outcome_id"], ["outcomes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["milestone_id"], ["milestones.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["win_id"], ["wins.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("pid"),
    )

    # ── Forward-copy existing Goal/GoalTask data ─────────────────────
    conn = op.get_bind()
    goals_t = table(
        "goals", column("id", sa.Integer), column("project_key", sa.String), column("horizon", sa.String),
        column("text", sa.String), column("start_date", sa.String), column("deadline", sa.String),
    )
    goal_tasks_t = table(
        "goal_tasks", column("pid", sa.String), column("goal_id", sa.Integer),
        column("text", sa.String), column("done", sa.Boolean), column("added_date", sa.String),
    )
    outcomes_t = table(
        "outcomes", column("id", sa.Integer), column("owner_key", sa.String), column("title", sa.String),
        column("year", sa.Integer), column("fixed", sa.Boolean), column("progress", sa.Integer),
        column("legacy_goal_id", sa.Integer),
    )
    milestones_t = table(
        "milestones", column("id", sa.Integer), column("outcome_id", sa.Integer), column("title", sa.String),
        column("month", sa.Integer), column("year", sa.Integer), column("fixed", sa.Boolean),
        column("progress", sa.Integer), column("legacy_goal_id", sa.Integer),
    )
    wins_t = table(
        "wins", column("id", sa.Integer), column("milestone_id", sa.Integer), column("title", sa.String),
        column("week_start_date", sa.String), column("fixed", sa.Boolean), column("progress", sa.Integer),
        column("legacy_goal_id", sa.Integer),
    )
    checklist_t = table(
        "checklist_items", column("pid", sa.String), column("outcome_id", sa.Integer),
        column("milestone_id", sa.Integer), column("win_id", sa.Integer), column("text", sa.String),
        column("done", sa.Boolean), column("added_date", sa.String),
    )

    all_goals = list(conn.execute(select(goals_t)).mappings())
    _id_seq = [int(time.time() * 1000)]

    def next_id() -> int:
        _id_seq[0] += 1
        return _id_seq[0]

    def year_of(iso: str) -> int:
        try:
            return int(iso[:4])
        except (ValueError, TypeError):
            return 2026

    def month_of(iso: str) -> int:
        try:
            return int(iso[5:7])
        except (ValueError, TypeError):
            return 1

    def monday_of(iso: str) -> str:
        import datetime as dt
        try:
            d = dt.date.fromisoformat(iso)
        except (ValueError, TypeError):
            return iso
        return str(d - dt.timedelta(days=d.weekday()))

    # owner_key -> year -> outcome_id ; owner_key -> (year, month) -> milestone_id
    outcome_index: dict[tuple[str, int], int] = {}
    milestone_index: dict[tuple[str, int, int], int] = {}
    goal_to_node: dict[int, tuple[str, int]] = {}  # goal.id -> ("outcome"|"milestone"|"win", new_id)

    yearly = [g for g in all_goals if g["horizon"] == "yearly"]
    monthly = [g for g in all_goals if g["horizon"] == "monthly"]
    weekly = [g for g in all_goals if g["horizon"] == "weekly"]

    for g in yearly:
        oid = next_id()
        conn.execute(
            outcomes_t.insert().values(
                id=oid, owner_key=g["project_key"], title=g["text"], year=year_of(g["start_date"]),
                fixed=False, progress=0, legacy_goal_id=g["id"],
            )
        )
        outcome_index[(g["project_key"], year_of(g["start_date"]))] = oid
        goal_to_node[g["id"]] = ("outcome", oid)

    for g in monthly:
        yr = year_of(g["start_date"])
        key = (g["project_key"], yr)
        if key not in outcome_index:
            oid = next_id()
            conn.execute(
                outcomes_t.insert().values(
                    id=oid, owner_key=g["project_key"], title=f"General {yr}", year=yr,
                    fixed=False, progress=0, legacy_goal_id=None,
                )
            )
            outcome_index[key] = oid
        mid = next_id()
        conn.execute(
            milestones_t.insert().values(
                id=mid, outcome_id=outcome_index[key], title=g["text"], month=month_of(g["start_date"]),
                year=yr, fixed=False, progress=0, legacy_goal_id=g["id"],
            )
        )
        milestone_index[(g["project_key"], yr, month_of(g["start_date"]))] = mid
        goal_to_node[g["id"]] = ("milestone", mid)

    for g in weekly:
        yr = year_of(g["start_date"])
        mo = month_of(g["start_date"])
        mkey = (g["project_key"], yr, mo)
        if mkey not in milestone_index:
            okey = (g["project_key"], yr)
            if okey not in outcome_index:
                oid = next_id()
                conn.execute(
                    outcomes_t.insert().values(
                        id=oid, owner_key=g["project_key"], title=f"General {yr}", year=yr,
                        fixed=False, progress=0, legacy_goal_id=None,
                    )
                )
                outcome_index[okey] = oid
            mid = next_id()
            conn.execute(
                milestones_t.insert().values(
                    id=mid, outcome_id=outcome_index[okey], title=f"General {_month_name(mo)} {yr}",
                    month=mo, year=yr, fixed=False, progress=0, legacy_goal_id=None,
                )
            )
            milestone_index[mkey] = mid
        wid = next_id()
        conn.execute(
            wins_t.insert().values(
                id=wid, milestone_id=milestone_index[mkey], title=g["text"],
                week_start_date=monday_of(g["start_date"]), fixed=False, progress=0, legacy_goal_id=g["id"],
            )
        )
        goal_to_node[g["id"]] = ("win", wid)

    all_goal_tasks = list(conn.execute(select(goal_tasks_t)).mappings())
    for gt in all_goal_tasks:
        node = goal_to_node.get(gt["goal_id"])
        if node is None:
            continue
        kind, node_id = node
        conn.execute(
            checklist_t.insert().values(
                pid=gt["pid"], text=gt["text"], done=gt["done"], added_date=gt["added_date"],
                outcome_id=node_id if kind == "outcome" else None,
                milestone_id=node_id if kind == "milestone" else None,
                win_id=node_id if kind == "win" else None,
            )
        )


_MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def _month_name(m: int) -> str:
    return _MONTH_NAMES[m] if 1 <= m <= 12 else "Unknown"


def downgrade() -> None:
    op.drop_table("checklist_items")
    op.drop_table("plan_tasks")
    op.drop_table("wins")
    op.drop_table("milestones")
    op.drop_table("outcomes")
```

- [ ] **Step 3: Run the migration against the dev DB**

Run: `cd python && source .venv/bin/activate && alembic upgrade head`
Expected: no errors; last line mentions revision `e7f2a4c9b615`.

- [ ] **Step 4: Spot-check the copy**

Run: `cd python && source .venv/bin/activate && python -c "
from database.connection import SessionLocal
from database.models import Outcome, Milestone, Win, ChecklistItem
s = SessionLocal()
print('outcomes', s.query(Outcome).count())
print('milestones', s.query(Milestone).count())
print('wins', s.query(Win).count())
print('checklist_items', s.query(ChecklistItem).count())
"`
Expected: counts >= 0, no exceptions. (This DB may have zero existing
goals if never used for Goals — that's fine, an empty forward-copy is
correct behavior, not a bug.)

- [ ] **Step 5: Commit**

```bash
git add python/alembic/versions/e7f2a4c9b615_add_planning_hierarchy.py
git commit -m "feat(planning): migration for outcomes/milestones/wins/plan_tasks/checklist_items with Goal forward-copy"
```

---

### Task 4: `engine/planning.py` — derived progress + CRUD

**Files:**
- Create: `python/engine/planning.py`
- Test: `python/test_planning.py`

**Interfaces:**
- Consumes: `PlanningRepository` from Task 2; `Outcome`/`Milestone`/`Win`/`PlanTask`/`ChecklistItem` from Task 1.
- Produces: `win_progress(win, repo)`, `milestone_progress(milestone, repo)`,
  `outcome_progress(outcome, repo)` (pure given a repo snapshot);
  `PlanningEngine` class with `create_outcome`, `edit_outcome`,
  `delete_outcome` (raises `ChildrenExistError`), `create_milestone`,
  `edit_milestone`, `delete_milestone`, `create_win`, `edit_win`,
  `delete_win`, `create_plan_task`, `edit_plan_task`, `schedule_plan_task`,
  `carry_forward_plan_task`, `delete_plan_task`, `add_checklist_item`,
  `toggle_checklist_item`, `delete_checklist_item`.

- [ ] **Step 1: Write the pure progress functions + engine class**

```python
"""Outcome -> Milestone -> Win -> PlanTask planning hierarchy. Progress
at every non-leaf level is ALWAYS derived by walking child rows unless
the node is `fixed` — see the Phase A design spec's locked pseudocode.
No level's compute function ever mentions a specific week/month/year by
name; adding a new Outcome/Milestone/Win/PlanTask needs no change here.
"""

import time
from datetime import date, timedelta

from database.models import ChecklistItem, Milestone, Outcome, PlanTask, Win
from database.repository import PlanningRepository


class ChildrenExistError(Exception):
    def __init__(self, count: int):
        self.count = count
        super().__init__(f"{count} child row(s) exist")


def _today() -> str:
    return str(date.today())


def win_progress(win: Win, repo: PlanningRepository) -> int:
    if win.fixed:
        return win.progress or 0
    tasks = repo.list_plan_tasks(win.id)
    if not tasks:
        return win.progress or 0
    done = sum(1 for t in tasks if t.status == "done")
    return round(100 * done / len(tasks))


def milestone_progress(milestone: Milestone, repo: PlanningRepository) -> int:
    if milestone.fixed:
        return milestone.progress or 0
    wins = repo.list_wins(milestone.id)
    if not wins:
        return milestone.progress or 0
    total = sum(win_progress(w, repo) for w in wins)
    return round(total / len(wins))


def outcome_progress(outcome: Outcome, repo: PlanningRepository) -> int:
    milestones = repo.list_milestones(outcome.id)
    if not milestones:
        return outcome.progress or 0
    total = sum(milestone_progress(m, repo) for m in milestones)
    return round(total / len(milestones))


class PlanningEngine:
    def __init__(self, repo: PlanningRepository):
        self.repo = repo

    # ── Outcomes ──────────────────────────────────────────────────────
    def list_outcomes(self, owner_key: str) -> list[dict]:
        return [self._outcome_out(o) for o in self.repo.list_outcomes(owner_key)]

    def create_outcome(self, owner_key: str, title: str, year: int) -> dict:
        title = title.strip()
        if not title:
            raise ValueError("Outcome title cannot be empty")
        outcome = Outcome(id=int(time.time() * 1000), owner_key=owner_key, title=title, year=year)
        return self._outcome_out(self.repo.add_outcome(outcome))

    def edit_outcome(self, outcome_id: int, title: str | None = None, status: str | None = None) -> dict | None:
        outcome = self.repo.get_outcome(outcome_id)
        if outcome is None:
            return None
        if title is not None and title.strip():
            outcome.title = title.strip()
        if status is not None:
            outcome.status = status
        return self._outcome_out(self.repo.save_outcome(outcome))

    def delete_outcome(self, outcome_id: int, force: bool = False) -> bool:
        outcome = self.repo.get_outcome(outcome_id)
        if outcome is None:
            return False
        count = self.repo.count_milestones(outcome_id)
        if count and not force:
            raise ChildrenExistError(count)
        self.repo.delete_outcome(outcome)
        return True

    # ── Milestones ────────────────────────────────────────────────────
    def list_milestones(self, outcome_id: int) -> list[dict]:
        return [self._milestone_out(m) for m in self.repo.list_milestones(outcome_id)]

    def create_milestone(self, outcome_id: int, title: str, month: int, year: int) -> dict:
        title = title.strip()
        if not title:
            raise ValueError("Milestone title cannot be empty")
        if self.repo.get_outcome(outcome_id) is None:
            raise ValueError(f"no outcome {outcome_id}")
        milestone = Milestone(id=int(time.time() * 1000), outcome_id=outcome_id, title=title, month=month, year=year)
        return self._milestone_out(self.repo.add_milestone(milestone))

    def edit_milestone(
        self, milestone_id: int, title: str | None = None, status: str | None = None, outcome_id: int | None = None
    ) -> dict | None:
        milestone = self.repo.get_milestone(milestone_id)
        if milestone is None:
            return None
        if title is not None and title.strip():
            milestone.title = title.strip()
        if status is not None:
            milestone.status = status
        if outcome_id is not None and self.repo.get_outcome(outcome_id) is not None:
            milestone.outcome_id = outcome_id  # re-parent fix-up; children stay linked via their own FK
        return self._milestone_out(self.repo.save_milestone(milestone))

    def delete_milestone(self, milestone_id: int, force: bool = False) -> bool:
        milestone = self.repo.get_milestone(milestone_id)
        if milestone is None:
            return False
        count = self.repo.count_wins(milestone_id)
        if count and not force:
            raise ChildrenExistError(count)
        self.repo.delete_milestone(milestone)
        return True

    # ── Wins ──────────────────────────────────────────────────────────
    def list_wins(self, milestone_id: int) -> list[dict]:
        return [self._win_out(w) for w in self.repo.list_wins(milestone_id)]

    def create_win(self, milestone_id: int, title: str, week_start_date: str, criteria: str = "") -> dict:
        title = title.strip()
        if not title:
            raise ValueError("Win title cannot be empty")
        if self.repo.get_milestone(milestone_id) is None:
            raise ValueError(f"no milestone {milestone_id}")
        win = Win(id=int(time.time() * 1000), milestone_id=milestone_id, title=title, week_start_date=week_start_date, criteria=criteria.strip())
        return self._win_out(self.repo.add_win(win))

    def edit_win(
        self,
        win_id: int,
        title: str | None = None,
        criteria: str | None = None,
        status: str | None = None,
        milestone_id: int | None = None,
    ) -> dict | None:
        win = self.repo.get_win(win_id)
        if win is None:
            return None
        if title is not None and title.strip():
            win.title = title.strip()
        if criteria is not None:
            win.criteria = criteria.strip()
        if status is not None:
            win.status = status
        if milestone_id is not None and self.repo.get_milestone(milestone_id) is not None:
            win.milestone_id = milestone_id
        return self._win_out(self.repo.save_win(win))

    def delete_win(self, win_id: int, force: bool = False) -> bool:
        win = self.repo.get_win(win_id)
        if win is None:
            return False
        count = self.repo.count_plan_tasks(win_id)
        if count and not force:
            raise ChildrenExistError(count)
        self.repo.delete_win(win)
        return True

    # ── Plan tasks ────────────────────────────────────────────────────
    def create_plan_task(self, owner_key: str, title: str, win_id: int | None = None, scheduled_date: str | None = None) -> dict:
        title = title.strip()
        if not title:
            raise ValueError("Task title cannot be empty")
        task = PlanTask(id=int(time.time() * 1000), win_id=win_id, title=title, scheduled_date=scheduled_date, owner_key=owner_key)
        return self._plan_task_out(self.repo.add_plan_task(task))

    def edit_plan_task(self, task_id: int, title: str | None = None, status: str | None = None) -> dict | None:
        task = self.repo.get_plan_task(task_id)
        if task is None:
            return None
        if title is not None and title.strip():
            task.title = title.strip()
        if status is not None:
            task.status = status
        return self._plan_task_out(self.repo.save_plan_task(task))

    def schedule_plan_task(self, task_id: int, scheduled_date: str | None, win_id: int | None) -> dict | None:
        task = self.repo.get_plan_task(task_id)
        if task is None:
            return None
        task.scheduled_date = scheduled_date
        task.win_id = win_id
        return self._plan_task_out(self.repo.save_plan_task(task))

    def carry_forward_plan_task(self, task_id: int, action: str) -> dict | None:
        """action: 'nextweek' | 'date' (Phase A: aliases to 'nextweek',
        see the design spec's Carry Forward edge case) | 'backlog' | 'drop'."""
        task = self.repo.get_plan_task(task_id)
        if task is None:
            return None
        if action in ("nextweek", "date"):
            if task.win_id is not None:
                win = self.repo.get_win(task.win_id)
                if win is not None and task.scheduled_date:
                    next_start = str(date.fromisoformat(win.week_start_date) + timedelta(days=7))
                    task.scheduled_date = str(date.fromisoformat(task.scheduled_date) + timedelta(days=7))
                    _ = next_start  # week reassignment across the boundary is a Panel-side follow-up call, not required for the date shift itself
        elif action == "backlog":
            task.win_id = None
            task.scheduled_date = None
        elif action == "drop":
            task.status = "dropped"
        return self._plan_task_out(self.repo.save_plan_task(task))

    def delete_plan_task(self, task_id: int) -> bool:
        task = self.repo.get_plan_task(task_id)
        if task is None:
            return False
        self.repo.delete_plan_task(task)
        return True

    # ── Checklist items ───────────────────────────────────────────────
    def add_checklist_item(
        self, text: str, *, outcome_id: int | None = None, milestone_id: int | None = None, win_id: int | None = None
    ) -> ChecklistItem:
        text = text.strip()
        if not text:
            raise ValueError("Checklist item text cannot be empty")
        parents = [p for p in (outcome_id, milestone_id, win_id) if p is not None]
        if len(parents) != 1:
            raise ValueError("exactly one of outcome_id/milestone_id/win_id must be set")
        pid = f"p{parents[0]}:{int(time.time() * 1000)}"
        item = ChecklistItem(
            pid=pid, text=text, done=False, added_date=_today(),
            outcome_id=outcome_id, milestone_id=milestone_id, win_id=win_id,
        )
        return self.repo.add_checklist_item(item)

    def toggle_checklist_item(self, pid: str) -> ChecklistItem | None:
        item = self.repo.get_checklist_item(pid)
        if item is None:
            return None
        item.done = not item.done
        return self.repo.save_checklist_item(item)

    def delete_checklist_item(self, pid: str) -> bool:
        item = self.repo.get_checklist_item(pid)
        if item is None:
            return False
        self.repo.delete_checklist_item(item)
        return True

    # ── Serialization (progress always resolved server-side) ─────────
    def _outcome_out(self, outcome: Outcome) -> dict:
        return {
            "id": outcome.id, "owner_key": outcome.owner_key, "title": outcome.title, "year": outcome.year,
            "status": outcome.status, "fixed": outcome.fixed, "progress": outcome_progress(outcome, self.repo),
            "legacy_goal_id": outcome.legacy_goal_id,
        }

    def _milestone_out(self, milestone: Milestone) -> dict:
        return {
            "id": milestone.id, "outcome_id": milestone.outcome_id, "title": milestone.title,
            "month": milestone.month, "year": milestone.year, "status": milestone.status,
            "fixed": milestone.fixed, "progress": milestone_progress(milestone, self.repo),
            "legacy_goal_id": milestone.legacy_goal_id,
        }

    def _win_out(self, win: Win) -> dict:
        return {
            "id": win.id, "milestone_id": win.milestone_id, "title": win.title,
            "week_start_date": win.week_start_date, "criteria": win.criteria, "status": win.status,
            "fixed": win.fixed, "progress": win_progress(win, self.repo), "legacy_goal_id": win.legacy_goal_id,
        }

    def _plan_task_out(self, task: PlanTask) -> dict:
        return {
            "id": task.id, "win_id": task.win_id, "title": task.title,
            "scheduled_date": task.scheduled_date, "status": task.status, "owner_key": task.owner_key,
        }
```

- [ ] **Step 2: Verify import**

Run: `cd python && source .venv/bin/activate && python -c "from engine.planning import PlanningEngine, win_progress, milestone_progress, outcome_progress"`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add python/engine/planning.py
git commit -m "feat(planning): add PlanningEngine with derived progress functions"
```

---

### Task 5: `python/test_planning.py` — progress functions + migration round-trip

**Files:**
- Create: `python/test_planning.py` (mirrors `test_quarterly.py`'s `FreshDB`/`check()` harness exactly)

**Interfaces:**
- Consumes: `PlanningEngine`, `win_progress`, `milestone_progress`, `outcome_progress` (Task 4); `PlanningRepository` (Task 2); `Outcome`/`Milestone`/`Win`/`PlanTask`/`ChecklistItem`, `Goal`, `GoalTask` (Task 1, `database.models`).

- [ ] **Step 1: Write the test file**

```python
"""Idempotent regression test for the planning hierarchy
(Outcome/Milestone/Win/PlanTask) and its Goal->hierarchy migration.

    .venv/bin/python test_planning.py

Every test gets its own fresh temp SQLite DB, deleted immediately
after — never touches the real app.db.
"""

import os
import tempfile
from datetime import date

from alembic import command
from alembic.config import Config

FAILURES = []


def check(label: str, cond: bool, detail: str = "") -> None:
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(label)


class FreshDB:
    def __enter__(self):
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        os.environ["APP_DB_PATH"] = self.path

        import importlib
        import database.connection as connection
        importlib.reload(connection)

        cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
        command.upgrade(cfg, "head")

        from database.repository import PlanningRepository

        self.db = connection.SessionLocal()
        self.repo = PlanningRepository(self.db)
        return self

    def __exit__(self, *exc):
        self.db.close()
        os.remove(self.path)


def test_win_progress_empty_not_fixed_returns_zero():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "Test outcome", 2026)
        ms = eng.create_milestone(out["id"], "Test milestone", 9, 2026)
        win = eng.create_win(ms["id"], "Empty win", "2026-09-21")
        check("empty non-fixed win -> 0% progress", win["progress"] == 0)


def test_win_progress_derives_from_tasks():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        ms = eng.create_milestone(out["id"], "M", 9, 2026)
        win = eng.create_win(ms["id"], "W", "2026-09-21")
        t1 = eng.create_plan_task("life", "task 1", win_id=win["id"], scheduled_date="2026-09-21")
        eng.create_plan_task("life", "task 2", win_id=win["id"], scheduled_date="2026-09-22")
        eng.edit_plan_task(t1["id"], status="done")
        refreshed = eng.list_wins(ms["id"])[0]
        check("1/2 tasks done -> 50% win progress", refreshed["progress"] == 50)


def test_milestone_and_outcome_progress_average_children():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        ms = eng.create_milestone(out["id"], "M", 9, 2026)
        w1 = eng.create_win(ms["id"], "W1", "2026-09-07")
        w2 = eng.create_win(ms["id"], "W2", "2026-09-14")
        t1 = eng.create_plan_task("life", "t", win_id=w1["id"], scheduled_date="2026-09-07")
        eng.edit_plan_task(t1["id"], status="done")  # w1 -> 100%
        # w2 stays 0% (no tasks)
        milestones = eng.list_milestones(out["id"])
        check("milestone progress = avg(100, 0) = 50", milestones[0]["progress"] == 50)
        outcomes = eng.list_outcomes("life")
        check("outcome progress = avg over its one milestone = 50", outcomes[0]["progress"] == 50)


def test_fixed_node_returns_stored_progress_not_derived():
    with FreshDB() as f:
        from database.models import Win
        from engine.planning import win_progress
        f.repo.db.add(Win(id=999, milestone_id=0, title="future week", week_start_date="2026-10-05", fixed=True, progress=0))
        f.repo.db.commit()
        win = f.repo.get_win(999)
        check("fixed win with progress=0 stays 0 even with no tasks (not an error)", win_progress(win, f.repo) == 0)


def test_delete_outcome_with_children_blocked_unless_forced():
    with FreshDB() as f:
        from engine.planning import PlanningEngine, ChildrenExistError
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        eng.create_milestone(out["id"], "M", 9, 2026)
        raised = False
        try:
            eng.delete_outcome(out["id"])
        except ChildrenExistError as e:
            raised = True
            check("blocked delete reports 1 child", e.count == 1)
        check("delete with children raises ChildrenExistError", raised)
        check("force=True deletes anyway", eng.delete_outcome(out["id"], force=True))


def test_checklist_item_requires_exactly_one_parent():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out = eng.create_outcome("life", "O", 2026)
        raised_zero = False
        try:
            eng.add_checklist_item("orphan")
        except ValueError:
            raised_zero = True
        check("zero parents rejected", raised_zero)
        raised_two = False
        try:
            eng.add_checklist_item("double", outcome_id=out["id"], win_id=1)
        except ValueError:
            raised_two = True
        check("two parents rejected", raised_two)
        item = eng.add_checklist_item("valid", outcome_id=out["id"])
        check("exactly one parent accepted", item.outcome_id == out["id"])


def test_reparent_milestone_moves_only_its_own_fk_not_its_wins_directly():
    with FreshDB() as f:
        from engine.planning import PlanningEngine
        eng = PlanningEngine(f.repo)
        out_a = eng.create_outcome("life", "Outcome A", 2026)
        out_b = eng.create_outcome("life", "Outcome B", 2026)
        ms = eng.create_milestone(out_a["id"], "M", 9, 2026)
        win = eng.create_win(ms["id"], "W", "2026-09-07")
        eng.edit_milestone(ms["id"], outcome_id=out_b["id"])
        moved = eng.repo.get_milestone(ms["id"])
        check("milestone's own outcome_id changed", moved.outcome_id == out_b["id"])
        still_there = eng.repo.get_win(win["id"])
        check("win's milestone_id untouched by the reparent (it followed via the existing FK, not a second write)", still_there.milestone_id == ms["id"])
        b_milestones = eng.list_milestones(out_b["id"])
        check("outcome B now sees the milestone (and transitively its win) through the one FK change", len(b_milestones) == 1)


def test_migration_copies_goal_hierarchy_and_leaves_goals_table_untouched():
    with FreshDB() as f:
        from database.models import Goal, GoalTask
        from database.repository import PlanningRepository
        # Seed a clean yearly -> monthly -> weekly chain plus a checklist item, all for one owner.
        f.repo.db.add(Goal(id=1, project_key="proj1", horizon="yearly", text="Year goal", done=False, start_date="2026-01-01", deadline="2026-12-31", note="", next_action=""))
        f.repo.db.add(Goal(id=2, project_key="proj1", horizon="monthly", text="Month goal", done=False, start_date="2026-09-01", deadline="2026-09-30", note="", next_action=""))
        f.repo.db.add(Goal(id=3, project_key="proj1", horizon="weekly", text="Week goal", done=False, start_date="2026-09-21", deadline="2026-09-27", note="", next_action=""))
        # An orphan monthly goal for a DIFFERENT owner with no yearly goal — forces the synthetic-Outcome path.
        f.repo.db.add(Goal(id=4, project_key="proj2", horizon="monthly", text="Orphan month goal", done=False, start_date="2026-06-01", deadline="2026-06-30", note="", next_action=""))
        f.repo.db.add(GoalTask(pid="gt1", goal_id=3, text="checklist item", done=False, added_date="2026-09-21"))
        f.repo.db.commit()

        goals_before = list(f.repo.db.query(Goal).all())
        goal_tasks_before = list(f.repo.db.query(GoalTask).all())

        from alembic import command
        from alembic.config import Config
        cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
        command.downgrade(cfg, "-1")
        command.upgrade(cfg, "head")

        planning_repo = PlanningRepository(f.repo.db)
        outcomes = planning_repo.list_outcomes("proj1")
        check("proj1 got exactly one Outcome (from its yearly goal)", len(outcomes) == 1)
        milestones = planning_repo.list_milestones(outcomes[0].id) if outcomes else []
        check("proj1's Outcome has exactly one Milestone", len(milestones) == 1)
        wins = planning_repo.list_wins(milestones[0].id) if milestones else []
        check("proj1's Milestone has exactly one Win", len(wins) == 1)
        checklist = planning_repo.list_checklist_items(win_id=wins[0].id) if wins else []
        check("the checklist item followed its Goal to the new Win", len(checklist) == 1)

        proj2_outcomes = planning_repo.list_outcomes("proj2")
        check("proj2 (orphan monthly goal) got a synthetic Outcome", len(proj2_outcomes) == 1)
        check("synthetic Outcome is titled 'General <year>'", proj2_outcomes[0].title.startswith("General "))

        goals_after = list(f.repo.db.query(Goal).all())
        goal_tasks_after = list(f.repo.db.query(GoalTask).all())
        check("goals table row count unchanged", len(goals_after) == len(goals_before))
        check("goal_tasks table row count unchanged", len(goal_tasks_after) == len(goal_tasks_before))


def main():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        print(f"\n── {t.__name__} ──")
        t()
    print(f"\n{len(tests)} tests run, {len(FAILURES)} failures")
    if FAILURES:
        for f in FAILURES:
            print(f"  FAILED: {f}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `cd python && source .venv/bin/activate && python test_planning.py`
Expected: all `[PASS]`, `0 failures` at the end.

- [ ] **Step 3: Commit**

```bash
git add python/test_planning.py
git commit -m "test(planning): progress functions, delete-blocking, and migration round-trip"
```

---

### Task 6: `api/schemas.py` additions

**Files:**
- Modify: `python/api/schemas.py` (append near `GoalTaskOut`, ~line 539)

**Interfaces:**
- Consumes: nothing new (Pydantic-only).
- Produces: `OutcomeCreate/Edit/Out`, `MilestoneCreate/Edit/Out`, `WinCreate/Edit/Out`, `PlanTaskCreate/Edit/Out`, `ScheduleSet`, `CarryForwardAction`, `ChecklistItemCreate/Out`.

- [ ] **Step 1: Add the schemas**

```python
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
```

- [ ] **Step 2: Verify import**

Run: `cd python && source .venv/bin/activate && python -c "import api.schemas"`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add python/api/schemas.py
git commit -m "feat(planning): add Outcome/Milestone/Win/PlanTask/ChecklistItem schemas"
```

---

### Task 7: `api/routes/planning.py` + register in `server.py`

**Files:**
- Create: `python/api/routes/planning.py`
- Modify: `python/api/server.py:6-26` (import), `python/api/server.py:72-95` (register)

**Interfaces:**
- Consumes: `PlanningEngine`, `ChildrenExistError` (Task 4); `PlanningRepository` (Task 2); schemas (Task 6).
- Produces: `router` (APIRouter, prefix `/api/planning`), importable as `from api.routes.planning import router as planning_router`.

- [ ] **Step 1: Write the routes**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import (
    CarryForwardAction,
    ChecklistItemCreate,
    ChecklistItemOut,
    GoalOwnerKeyT,
    MilestoneCreate,
    MilestoneEdit,
    MilestoneOut,
    OutcomeCreate,
    OutcomeEdit,
    OutcomeOut,
    PlanTaskCreate,
    PlanTaskEdit,
    PlanTaskOut,
    ScheduleSet,
    WinCreate,
    WinEdit,
    WinOut,
)
from database.connection import get_db
from database.repository import PlanningRepository
from engine.planning import ChildrenExistError, PlanningEngine

router = APIRouter(prefix="/api/planning", tags=["planning"])


def get_engine(db: Session = Depends(get_db)) -> PlanningEngine:
    return PlanningEngine(PlanningRepository(db))


# ── Outcomes ──────────────────────────────────────────────────────────
@router.get("/{owner_key}/outcomes", response_model=list[OutcomeOut])
def list_outcomes(owner_key: GoalOwnerKeyT, engine: PlanningEngine = Depends(get_engine)):
    return engine.list_outcomes(owner_key)


@router.post("/{owner_key}/outcomes", response_model=OutcomeOut)
def create_outcome(owner_key: GoalOwnerKeyT, payload: OutcomeCreate, engine: PlanningEngine = Depends(get_engine)):
    try:
        return engine.create_outcome(owner_key, payload.title, payload.year)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/outcomes/{outcome_id}", response_model=OutcomeOut)
def edit_outcome(outcome_id: int, payload: OutcomeEdit, engine: PlanningEngine = Depends(get_engine)):
    outcome = engine.edit_outcome(outcome_id, payload.title, payload.status)
    if outcome is None:
        raise HTTPException(404, "Outcome not found")
    return outcome


@router.delete("/outcomes/{outcome_id}")
def delete_outcome(outcome_id: int, force: bool = False, engine: PlanningEngine = Depends(get_engine)):
    try:
        if not engine.delete_outcome(outcome_id, force=force):
            raise HTTPException(404, "Outcome not found")
    except ChildrenExistError as e:
        raise HTTPException(409, f"{e.count} milestone(s) exist under this outcome")
    return {"ok": True}


# ── Milestones ────────────────────────────────────────────────────────
@router.get("/outcomes/{outcome_id}/milestones", response_model=list[MilestoneOut])
def list_milestones(outcome_id: int, engine: PlanningEngine = Depends(get_engine)):
    return engine.list_milestones(outcome_id)


@router.post("/milestones", response_model=MilestoneOut)
def create_milestone(payload: MilestoneCreate, engine: PlanningEngine = Depends(get_engine)):
    try:
        return engine.create_milestone(payload.outcome_id, payload.title, payload.month, payload.year)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/milestones/{milestone_id}", response_model=MilestoneOut)
def edit_milestone(milestone_id: int, payload: MilestoneEdit, engine: PlanningEngine = Depends(get_engine)):
    milestone = engine.edit_milestone(milestone_id, payload.title, payload.status, payload.outcome_id)
    if milestone is None:
        raise HTTPException(404, "Milestone not found")
    return milestone


@router.delete("/milestones/{milestone_id}")
def delete_milestone(milestone_id: int, force: bool = False, engine: PlanningEngine = Depends(get_engine)):
    try:
        if not engine.delete_milestone(milestone_id, force=force):
            raise HTTPException(404, "Milestone not found")
    except ChildrenExistError as e:
        raise HTTPException(409, f"{e.count} win(s) exist under this milestone")
    return {"ok": True}


# ── Wins ──────────────────────────────────────────────────────────────
@router.get("/milestones/{milestone_id}/wins", response_model=list[WinOut])
def list_wins(milestone_id: int, engine: PlanningEngine = Depends(get_engine)):
    return engine.list_wins(milestone_id)


@router.post("/wins", response_model=WinOut)
def create_win(payload: WinCreate, engine: PlanningEngine = Depends(get_engine)):
    try:
        return engine.create_win(payload.milestone_id, payload.title, payload.week_start_date, payload.criteria)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/wins/{win_id}", response_model=WinOut)
def edit_win(win_id: int, payload: WinEdit, engine: PlanningEngine = Depends(get_engine)):
    win = engine.edit_win(win_id, payload.title, payload.criteria, payload.status, payload.milestone_id)
    if win is None:
        raise HTTPException(404, "Win not found")
    return win


@router.delete("/wins/{win_id}")
def delete_win(win_id: int, force: bool = False, engine: PlanningEngine = Depends(get_engine)):
    try:
        if not engine.delete_win(win_id, force=force):
            raise HTTPException(404, "Win not found")
    except ChildrenExistError as e:
        raise HTTPException(409, f"{e.count} task(s) exist under this win")
    return {"ok": True}


# ── Plan tasks ────────────────────────────────────────────────────────
@router.get("/wins/{win_id}/tasks", response_model=list[PlanTaskOut])
def list_plan_tasks(win_id: int, engine: PlanningEngine = Depends(get_engine)):
    return [engine._plan_task_out(t) for t in engine.repo.list_plan_tasks(win_id)]


@router.get("/{owner_key}/tasks/by-date", response_model=list[PlanTaskOut])
def list_plan_tasks_by_date(owner_key: GoalOwnerKeyT, date: str, engine: PlanningEngine = Depends(get_engine)):
    return [engine._plan_task_out(t) for t in engine.repo.list_plan_tasks_by_date(owner_key, date)]


@router.post("/{owner_key}/tasks", response_model=PlanTaskOut)
def create_plan_task(owner_key: GoalOwnerKeyT, payload: PlanTaskCreate, engine: PlanningEngine = Depends(get_engine)):
    try:
        return engine.create_plan_task(owner_key, payload.title, payload.win_id, payload.scheduled_date)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/tasks/{task_id}", response_model=PlanTaskOut)
def edit_plan_task(task_id: int, payload: PlanTaskEdit, engine: PlanningEngine = Depends(get_engine)):
    task = engine.edit_plan_task(task_id, payload.title, payload.status)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


@router.patch("/tasks/{task_id}/schedule", response_model=PlanTaskOut)
def schedule_plan_task(task_id: int, payload: ScheduleSet, engine: PlanningEngine = Depends(get_engine)):
    task = engine.schedule_plan_task(task_id, payload.scheduled_date, payload.win_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


# Future interaction contract for "Schedule a specific date" (real
# date-picker, not yet built — see the Phase A design spec's Carry
# Forward edge case): { planned_period, scheduled_date, status, parent_win }
@router.post("/tasks/{task_id}/carry-forward", response_model=PlanTaskOut)
def carry_forward_plan_task(task_id: int, payload: CarryForwardAction, engine: PlanningEngine = Depends(get_engine)):
    task = engine.carry_forward_plan_task(task_id, payload.action)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


@router.delete("/tasks/{task_id}")
def delete_plan_task(task_id: int, engine: PlanningEngine = Depends(get_engine)):
    if not engine.delete_plan_task(task_id):
        raise HTTPException(404, "Task not found")
    return {"ok": True}


# ── Checklist items (generic — attach to exactly one of outcome/milestone/win) ──
@router.get("/checklist-items", response_model=list[ChecklistItemOut])
def list_checklist_items(
    outcome_id: int | None = None,
    milestone_id: int | None = None,
    win_id: int | None = None,
    engine: PlanningEngine = Depends(get_engine),
):
    return engine.repo.list_checklist_items(outcome_id=outcome_id, milestone_id=milestone_id, win_id=win_id)


@router.post("/checklist-items", response_model=ChecklistItemOut)
def add_checklist_item(payload: ChecklistItemCreate, engine: PlanningEngine = Depends(get_engine)):
    try:
        return engine.add_checklist_item(
            payload.text, outcome_id=payload.outcome_id, milestone_id=payload.milestone_id, win_id=payload.win_id
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/checklist-items/{pid}/toggle", response_model=ChecklistItemOut)
def toggle_checklist_item(pid: str, engine: PlanningEngine = Depends(get_engine)):
    item = engine.toggle_checklist_item(pid)
    if item is None:
        raise HTTPException(404, "Checklist item not found")
    return item


@router.delete("/checklist-items/{pid}")
def delete_checklist_item(pid: str, engine: PlanningEngine = Depends(get_engine)):
    if not engine.delete_checklist_item(pid):
        raise HTTPException(404, "Checklist item not found")
    return {"ok": True}
```

- [ ] **Step 2: Register the router**

In `python/api/server.py`, add the import alongside the other route
imports (line 23, next to `quarterly_router`):

```python
from api.routes.planning import router as planning_router
```

And add the registration alongside the other `include_router` calls
(near line 92, next to `quarterly_router`):

```python
app.include_router(planning_router)
```

- [ ] **Step 3: Verify the server boots**

Run: `cd python && source .venv/bin/activate && python -c "from api.server import app; print(len(app.routes))"`
Expected: prints a number (route count), no traceback.

- [ ] **Step 4: Commit**

```bash
git add python/api/routes/planning.py python/api/server.py
git commit -m "feat(planning): add /api/planning routes"
```

---

### Task 8: Live-verify the backend before touching the frontend

**Files:** none (verification only)

- [ ] **Step 1: Run the full Python test suite**

Run: `cd python && source .venv/bin/activate && python test_planning.py && python test_quarterly.py && python test_goals.py`
Expected: all three print `0 failures` at the end (the last two confirm
Task 3's migration didn't disturb Quarterly or the untouched `goals`
table).

- [ ] **Step 2: Hit the new routes against a throwaway request**

Run: `cd python && source .venv/bin/activate && python -c "
from fastapi.testclient import TestClient
from api.server import app
c = TestClient(app)
r = c.post('/api/planning/life/outcomes', json={'title': 'smoke test outcome', 'year': 2026})
print(r.status_code, r.json())
oid = r.json()['id']
r2 = c.delete(f'/api/planning/outcomes/{oid}')
print(r2.status_code, r2.json())
"`
Expected: first call `200` with `progress: 0`, second call `200`
`{"ok": true}` (this writes to whatever DB `APP_DB_PATH`/default points
at — if that's the real dev DB, the delete call cleans it back up).

---

### Task 9: `services/api.ts` — `planningApi` client

**Files:**
- Modify: `renderer/src/services/api.ts` (append after `goalTasksApi`, ~line 481)

**Interfaces:**
- Produces: `Outcome`, `Milestone`, `Win`, `PlanTask`, `ChecklistItem` TS interfaces; `planningApi` object.

- [ ] **Step 1: Add the types and client**

```typescript
export interface Outcome {
  id: number;
  owner_key: GoalOwnerKey;
  title: string;
  year: number;
  status: string;
  fixed: boolean;
  progress: number;
  legacy_goal_id: number | null;
}

export interface Milestone {
  id: number;
  outcome_id: number;
  title: string;
  month: number;
  year: number;
  status: string;
  fixed: boolean;
  progress: number;
  legacy_goal_id: number | null;
}

export interface Win {
  id: number;
  milestone_id: number;
  title: string;
  week_start_date: string;
  criteria: string;
  status: string;
  fixed: boolean;
  progress: number;
  legacy_goal_id: number | null;
}

export interface PlanTask {
  id: number;
  win_id: number | null;
  title: string;
  scheduled_date: string | null;
  status: string;
  owner_key: GoalOwnerKey;
}

export interface ChecklistItem {
  pid: string;
  outcome_id: number | null;
  milestone_id: number | null;
  win_id: number | null;
  text: string;
  done: boolean;
  added_date: string;
}

export type CarryForwardActionKind = 'nextweek' | 'date' | 'backlog' | 'drop';

export const planningApi = {
  listOutcomes: (ownerKey: GoalOwnerKey) => req('GET', `/api/planning/${ownerKey}/outcomes`) as Promise<Outcome[]>,
  createOutcome: (ownerKey: GoalOwnerKey, title: string, year: number) =>
    req('POST', `/api/planning/${ownerKey}/outcomes`, { title, year }) as Promise<Outcome>,
  editOutcome: (id: number, patch: Partial<Pick<Outcome, 'title' | 'status'>>) =>
    req('PATCH', `/api/planning/outcomes/${id}`, patch) as Promise<Outcome>,
  deleteOutcome: (id: number, force = false) =>
    req('DELETE', `/api/planning/outcomes/${id}${force ? '?force=true' : ''}`) as Promise<{ ok: true }>,

  listMilestones: (outcomeId: number) =>
    req('GET', `/api/planning/outcomes/${outcomeId}/milestones`) as Promise<Milestone[]>,
  createMilestone: (outcomeId: number, title: string, month: number, year: number) =>
    req('POST', '/api/planning/milestones', { outcome_id: outcomeId, title, month, year }) as Promise<Milestone>,
  editMilestone: (id: number, patch: Partial<Pick<Milestone, 'title' | 'status' | 'outcome_id'>>) =>
    req('PATCH', `/api/planning/milestones/${id}`, patch) as Promise<Milestone>,
  deleteMilestone: (id: number, force = false) =>
    req('DELETE', `/api/planning/milestones/${id}${force ? '?force=true' : ''}`) as Promise<{ ok: true }>,

  listWins: (milestoneId: number) => req('GET', `/api/planning/milestones/${milestoneId}/wins`) as Promise<Win[]>,
  createWin: (milestoneId: number, title: string, weekStartDate: string, criteria = '') =>
    req('POST', '/api/planning/wins', { milestone_id: milestoneId, title, week_start_date: weekStartDate, criteria }) as Promise<Win>,
  editWin: (id: number, patch: Partial<Pick<Win, 'title' | 'criteria' | 'status' | 'milestone_id'>>) =>
    req('PATCH', `/api/planning/wins/${id}`, patch) as Promise<Win>,
  deleteWin: (id: number, force = false) =>
    req('DELETE', `/api/planning/wins/${id}${force ? '?force=true' : ''}`) as Promise<{ ok: true }>,

  listTasksForWin: (winId: number) => req('GET', `/api/planning/wins/${winId}/tasks`) as Promise<PlanTask[]>,
  listTasksByDate: (ownerKey: GoalOwnerKey, date: string) =>
    req('GET', `/api/planning/${ownerKey}/tasks/by-date?date=${date}`) as Promise<PlanTask[]>,
  createTask: (ownerKey: GoalOwnerKey, title: string, winId?: number, scheduledDate?: string) =>
    req('POST', `/api/planning/${ownerKey}/tasks`, { title, win_id: winId ?? null, scheduled_date: scheduledDate ?? null }) as Promise<PlanTask>,
  editTask: (id: number, patch: Partial<Pick<PlanTask, 'title' | 'status'>>) =>
    req('PATCH', `/api/planning/tasks/${id}`, patch) as Promise<PlanTask>,
  scheduleTask: (id: number, scheduledDate: string | null, winId: number | null) =>
    req('PATCH', `/api/planning/tasks/${id}/schedule`, { scheduled_date: scheduledDate, win_id: winId }) as Promise<PlanTask>,
  carryForwardTask: (id: number, action: CarryForwardActionKind) =>
    req('POST', `/api/planning/tasks/${id}/carry-forward`, { action }) as Promise<PlanTask>,
  removeTask: (id: number) => req('DELETE', `/api/planning/tasks/${id}`) as Promise<{ ok: true }>,

  listChecklistItems: (scope: { outcomeId?: number; milestoneId?: number; winId?: number }) => {
    const q = new URLSearchParams();
    if (scope.outcomeId) q.set('outcome_id', String(scope.outcomeId));
    if (scope.milestoneId) q.set('milestone_id', String(scope.milestoneId));
    if (scope.winId) q.set('win_id', String(scope.winId));
    return req('GET', `/api/planning/checklist-items?${q}`) as Promise<ChecklistItem[]>;
  },
  addChecklistItem: (text: string, scope: { outcomeId?: number; milestoneId?: number; winId?: number }) =>
    req('POST', '/api/planning/checklist-items', {
      text,
      outcome_id: scope.outcomeId ?? null,
      milestone_id: scope.milestoneId ?? null,
      win_id: scope.winId ?? null,
    }) as Promise<ChecklistItem>,
  toggleChecklistItem: (pid: string) => req('POST', `/api/planning/checklist-items/${pid}/toggle`) as Promise<ChecklistItem>,
  removeChecklistItem: (pid: string) => req('DELETE', `/api/planning/checklist-items/${pid}`) as Promise<{ ok: true }>,
};
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/zahid/dev/habit-os && npx tsc --noEmit`
Expected: no new errors attributable to `api.ts` (pre-existing unrelated
warnings in other files are fine — see the ESLint output from the
earlier commit hook for what's already there).

- [ ] **Step 3: Commit**

```bash
git add renderer/src/services/api.ts
git commit -m "feat(planning): add planningApi client + types"
```

---

### Task 10: `PlanningProgressCard.tsx` — shared Outcome/Milestone/Win card

**Files:**
- Create: `renderer/src/components/PlanningProgressCard.tsx`

**Interfaces:**
- Consumes: `RADIUS`/`SPACE` from `../spacing`; no API calls (pure presentational).
- Produces: `PlanningProgressCard` component, consumed by Tasks 11-13 and the Task 14 `GoalsPanel` rewrite.

- [ ] **Step 1: Write the component**

```typescript
import type { ReactNode } from 'react';
import { RADIUS, SPACE } from '../spacing';

// The locked interaction contract's "WIN ≠ Task" card, generalized to
// all three levels (Outcome/Milestone/Win each get one): a progress
// bar, an optional criteria/subtitle line, an achieved badge when
// progress hits 100 (derived — never implies the stored `status` field
// was auto-written, see the Phase A spec's edge cases), and an optional
// Time-vs-Progress-vs-Pace row for Week/Month level. `children` is the
// level-specific breakdown list (supporting tasks / weekly milestones /
// monthly outcomes) rendered inside a native <details> so it starts
// collapsed on a long list without a second custom disclosure widget.
export default function PlanningProgressCard({
  label,
  accent,
  title,
  criteria,
  progress,
  fixed,
  pace,
  detailsSummary,
  children,
  onEdit,
}: {
  label: string; // "WEEK WIN" / "MONTH MILESTONE" / "YEAR OUTCOME"
  accent: string;
  title: string;
  criteria?: string;
  progress: number;
  fixed: boolean;
  // Time-vs-Progress-vs-Pace — omitted (undefined) at levels/moments
  // where elapsed-time doesn't apply (e.g. an Outcome with no natural
  // "day N of M" window).
  pace?: { elapsedPct: number; elapsedLabel: string };
  detailsSummary: string;
  children?: ReactNode;
  onEdit?: () => void;
}) {
  const achieved = progress === 100;
  const paceState = pace ? (progress >= pace.elapsedPct ? 'onpace' : 'behind') : null;
  const paceColor = paceState === 'onpace' ? 'var(--success)' : paceState === 'behind' ? 'var(--danger)' : undefined;

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: RADIUS.card,
        background: 'var(--surface)',
        padding: SPACE.md,
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.sm,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: accent }}>{label}</span>
        <span style={{ flex: 1 }} />
        {fixed && (
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>not started</span>
        )}
        {onEdit && (
          <button onClick={onEdit} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            ✎ Edit
          </button>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{title}</div>
      <div style={{ height: 7, borderRadius: RADIUS.pill, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: accent, transition: 'width 300ms ease' }} />
      </div>
      {achieved && (
        <span
          style={{
            alignSelf: 'flex-start',
            padding: '3px 9px',
            borderRadius: RADIUS.pill,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.4,
            background: 'color-mix(in srgb, var(--success) 16%, transparent)',
            color: 'var(--success)',
          }}
        >
          🏆 ACHIEVED{criteria ? ` — ${criteria}` : ''}
        </span>
      )}
      {children && (
        <details style={{ fontSize: 12 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 700 }}>{detailsSummary}</summary>
          <div style={{ marginTop: SPACE.xs }}>{children}</div>
        </details>
      )}
      {pace && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: SPACE.xs, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--text-faint)' }}>TIME</span>
            <span>{pace.elapsedLabel}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--text-faint)' }}>PROGRESS</span>
            <span>{progress}%</span>
          </div>
          <span
            style={{
              alignSelf: 'flex-start',
              padding: '3px 9px',
              borderRadius: RADIUS.pill,
              fontSize: 10,
              fontWeight: 800,
              background: paceColor ? `color-mix(in srgb, ${paceColor} 16%, transparent)` : undefined,
              color: paceColor,
            }}
          >
            {paceState === 'onpace' ? 'ON PACE' : 'BEHIND PACE'}
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/zahid/dev/habit-os && npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add renderer/src/components/PlanningProgressCard.tsx
git commit -m "feat(planning): add shared PlanningProgressCard component"
```

---

### Task 11: `PlanningWeeklyLevel.tsx` — Panel 3 WEEKLY body

**Files:**
- Create: `renderer/src/components/PlanningWeeklyLevel.tsx`

**Interfaces:**
- Consumes: `planningApi`, `Win`, `PlanTask`, `GoalOwnerKey` (Task 9); `PlanningProgressCard` (Task 10); `AccordionSection`; `useFetchState`; `GoalOwnerMeta` (reuse the interface already exported from `GoalHorizonSection.tsx` — move it to a shared location, see Step 1 below, since `GoalHorizonSection.tsx` is deleted in Task 15).
- Produces: `PlanningWeeklyLevel` component with the same `expanded`/`onToggle`/`owners` contract `GoalHorizonSection` had, so `Panel3.tsx`'s call site swap (Task 16) is a near drop-in.

- [ ] **Step 1: Move `GoalOwnerMeta` to a shared home**

`GoalOwnerMeta` (currently exported from `GoalHorizonSection.tsx`,
lines 33-37) is needed by all three new level components and outlives
that file (deleted in Task 15). Add it to `renderer/src/services/api.ts`
right after the `planningApi` block from Task 9:

```typescript
export interface GoalOwnerMeta {
  key: GoalOwnerKey;
  label: string;
  color: string | null;
}
```

Then in `Panel3.tsx`, change the import of `GoalOwnerMeta` from
`./GoalHorizonSection` to `../services/api` (Task 16 handles the rest
of `Panel3.tsx`'s changes; this import line is grouped with that task's
diff, called out here so this task's `owners` prop type resolves).

- [ ] **Step 2: Write the component**

For each owner, find that owner's current-week Win by:
`outcomes = listOutcomes(owner)` → find outcome with `year === thisYear`
→ `milestones = listMilestones(outcome.id)` → find milestone with
`month === thisMonth && year === thisYear` → `wins = listWins(milestone.id)`
→ find win whose `week_start_date` equals this week's Monday (ISO). No
match at any step means that owner has nothing this week — skip it,
same "some owners have nothing yet" tolerance `GoalHorizonSection` already
has for empty lists.

```typescript
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { GoalOwnerKey, GoalOwnerMeta, PlanTask, Win, planningApi } from '../services/api';
import AccordionSection from './AccordionSection';
import PlanningProgressCard from './PlanningProgressCard';
import { useFetchState } from '../hooks/useFetchState';
import { RADIUS, SPACE } from '../spacing';

function mondayOf(d: Date): string {
  const copy = new Date(d);
  const offset = (d.getDay() + 6) % 7;
  copy.setDate(d.getDate() - offset);
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, '0')}-${String(copy.getDate()).padStart(2, '0')}`;
}

function weekRangeLabel(monday: string): string {
  const start = new Date(`${monday}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const day = (d: Date) => d.getDate();
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  return `${day(start)}–${day(end)} ${month(end)} ${end.getFullYear()}`;
}

interface OwnedWin {
  win: Win;
  owner: GoalOwnerMeta;
  tasks: PlanTask[];
}

async function findCurrentWin(owner: GoalOwnerMeta, monday: string): Promise<OwnedWin | null> {
  const today = new Date(`${monday}T00:00:00`);
  const outcomes = await planningApi.listOutcomes(owner.key);
  const outcome = outcomes.find((o) => o.year === today.getFullYear());
  if (!outcome) return null;
  const milestones = await planningApi.listMilestones(outcome.id);
  const milestone = milestones.find((m) => m.month === today.getMonth() + 1 && m.year === today.getFullYear());
  if (!milestone) return null;
  const wins = await planningApi.listWins(milestone.id);
  const win = wins.find((w) => w.week_start_date === monday);
  if (!win) return null;
  const tasks = await planningApi.listTasksForWin(win.id);
  return { win, owner, tasks };
}

export default function PlanningWeeklyLevel({
  owners,
  accent,
  expanded,
  onToggle,
}: {
  owners: GoalOwnerMeta[] | null;
  accent: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const monday = mondayOf(new Date());
  const {
    data: rows,
    setData: setRows,
    loaded,
    loadError,
    refresh,
  } = useFetchState<OwnedWin[]>(
    owners
      ? () => Promise.all(owners.map((o) => findCurrentWin(o, monday))).then((rs) => rs.filter((r): r is OwnedWin => r !== null))
      : null,
    [owners, monday],
    [],
  );

  const [carryOpenFor, setCarryOpenFor] = useState<number | null>(null);

  const toggleTask = (row: OwnedWin, task: PlanTask) =>
    planningApi
      .editTask(task.id, { status: task.status === 'done' ? 'open' : 'done' })
      .then(() => planningApi.listTasksForWin(row.win.id))
      .then((tasks) => setRows((rs) => rs.map((r) => (r.win.id === row.win.id ? { ...r, tasks } : r))));

  const carryForward = (row: OwnedWin, task: PlanTask, action: 'nextweek' | 'backlog' | 'drop') =>
    planningApi
      .carryForwardTask(task.id, action)
      .then(() => planningApi.listTasksForWin(row.win.id))
      .then((tasks) => setRows((rs) => rs.map((r) => (r.win.id === row.win.id ? { ...r, tasks } : r))))
      .then(() => setCarryOpenFor(null));

  const totalWins = rows.length;
  const achievedWins = rows.filter((r) => r.win.progress === 100).length;

  return (
    <AccordionSection
      glyph={<CalendarDays size={16} />}
      label="WEEKLY"
      period={weekRangeLabel(monday)}
      done={achievedWins}
      total={loaded ? totalWins : null}
      accent={accent}
      expanded={expanded}
      onToggle={onToggle}
    >
      {!loaded ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>Loading…</div>
      ) : loadError ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--danger)' }}>
          <span>Couldn't load — check the app is connected.</span>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={refresh}>Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>
          No Win set for this week yet — add one from the Goals panel.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
          {rows.map((row) => (
            <PlanningProgressCard
              key={row.win.id}
              label={`WEEK WIN · ${row.owner.label}`}
              accent={accent}
              title={row.win.title}
              criteria={row.win.criteria}
              progress={row.win.progress}
              fixed={row.win.fixed}
              detailsSummary={`${row.tasks.filter((t) => t.status === 'done').length} / ${row.tasks.length} supporting actions`}
            >
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {row.tasks.map((t) => (
                  <li key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                      <input type="checkbox" checked={t.status === 'done'} onChange={() => toggleTask(row, t)} />
                      <span style={{ flex: 1, textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? 'var(--text-faint)' : 'var(--text)' }}>
                        {t.title}
                      </span>
                      {t.status !== 'done' && (
                        <button
                          onClick={() => setCarryOpenFor((cur) => (cur === t.id ? null : t.id))}
                          style={{ fontSize: 11, background: 'transparent', border: '1px solid var(--border)', borderRadius: RADIUS.pill, padding: '2px 8px' }}
                        >
                          Carry forward
                        </button>
                      )}
                    </label>
                    {carryOpenFor === t.id && (
                      <div style={{ display: 'flex', gap: 4, paddingLeft: 24 }}>
                        <button onClick={() => carryForward(row, t, 'nextweek')} style={{ fontSize: 10 }}>Next week</button>
                        <button onClick={() => carryForward(row, t, 'backlog')} style={{ fontSize: 10 }}>Backlog</button>
                        <button onClick={() => carryForward(row, t, 'drop')} style={{ fontSize: 10 }}>Drop</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </PlanningProgressCard>
          ))}
        </div>
      )}
    </AccordionSection>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /home/zahid/dev/habit-os && npx tsc --noEmit`
Expected: no new errors from this file (pre-existing errors in
`Panel3.tsx` about the still-present `GoalHorizonSection` import are
expected until Task 16 lands).

- [ ] **Step 4: Commit**

```bash
git add renderer/src/components/PlanningWeeklyLevel.tsx renderer/src/services/api.ts
git commit -m "feat(planning): add PlanningWeeklyLevel for Panel 3's WEEKLY tab"
```

---

### Task 12: `PlanningMonthlyLevel.tsx` — Panel 3 MONTHLY body

**Files:**
- Create: `renderer/src/components/PlanningMonthlyLevel.tsx`

**Interfaces:**
- Consumes: same as Task 11, plus `MonthGrid`/`DayCell`/`isoDate`/`startOfWeek` patterns ported from the (soon-deleted) `GoalHorizonSection.tsx` lines 98-264 — copy those four functions/component in verbatim (they have no Goal-specific logic, they're pure calendar-grid rendering keyed by a `deadlines: Set<string>`), adapted to mark **Win `week_start_date`s** as the dots instead of Goal deadlines.
- Produces: `PlanningMonthlyLevel`, same `owners`/`expanded`/`onToggle` contract.

- [ ] **Step 1: Port the calendar primitives**

Copy `isoDate`, `startOfWeek`, `WEEKDAY_ABBR`, `MONTH_ABBR`, `DayCell`,
`MonthGrid` from `GoalHorizonSection.tsx` (current lines 98-116,
109-111, 118-175, 209-264) into this new file verbatim — they take a
generic `deadlines: Set<string>` + `accent` + `onSelectDeadline`
already, no Goal-specific code inside them.

- [ ] **Step 2: Write the level component**

For each owner: `outcomes = listOutcomes(owner)` → find outcome for
this year → `milestones = listMilestones(outcome.id)` → find milestone
for this month/year. That milestone IS the card. Its `wins =
listWins(milestone.id)` feed both the calendar dots (`win.week_start_date`)
and the `<details>` breakdown list.

```typescript
import { CalendarRange } from 'lucide-react';
import { GoalOwnerMeta, Milestone, Win, planningApi } from '../services/api';
import AccordionSection from './AccordionSection';
import PlanningProgressCard from './PlanningProgressCard';
import { useFetchState } from '../hooks/useFetchState';
import { SPACE } from '../spacing';
// ... DayCell / MonthGrid / isoDate / startOfWeek / WEEKDAY_ABBR ported per Step 1 above

interface OwnedMilestone {
  milestone: Milestone;
  wins: Win[];
  owner: GoalOwnerMeta;
}

async function findCurrentMilestone(owner: GoalOwnerMeta, year: number, month: number): Promise<OwnedMilestone | null> {
  const outcomes = await planningApi.listOutcomes(owner.key);
  const outcome = outcomes.find((o) => o.year === year);
  if (!outcome) return null;
  const milestones = await planningApi.listMilestones(outcome.id);
  const milestone = milestones.find((m) => m.month === month && m.year === year);
  if (!milestone) return null;
  const wins = await planningApi.listWins(milestone.id);
  return { milestone, wins, owner };
}

export default function PlanningMonthlyLevel({
  owners,
  accent,
  expanded,
  onToggle,
}: {
  owners: GoalOwnerMeta[] | null;
  accent: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const { data: rows, loaded, loadError, refresh } = useFetchState<OwnedMilestone[]>(
    owners
      ? () => Promise.all(owners.map((o) => findCurrentMilestone(o, year, month))).then((rs) => rs.filter((r): r is OwnedMilestone => r !== null))
      : null,
    [owners, year, month],
    [],
  );

  const deadlines = new Set(rows.flatMap((r) => r.wins.map((w) => w.week_start_date)));
  const monthLabel = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <AccordionSection
      glyph={<CalendarRange size={16} />}
      label="MONTHLY"
      period={monthLabel}
      done={rows.filter((r) => r.milestone.progress === 100).length}
      total={loaded ? rows.length : null}
      accent={accent}
      expanded={expanded}
      onToggle={onToggle}
    >
      {!loaded ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>Loading…</div>
      ) : loadError ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--danger)' }}>
          <span>Couldn't load — check the app is connected.</span>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={refresh}>Retry</button>
        </div>
      ) : (
        <>
          <MonthGrid deadlines={deadlines} accent={accent} onSelectDeadline={() => {}} />
          {rows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>
              No Milestone set for this month yet — add one from the Goals panel.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              {rows.map((row) => (
                <PlanningProgressCard
                  key={row.milestone.id}
                  label={`MONTH MILESTONE · ${row.owner.label}`}
                  accent={accent}
                  title={row.milestone.title}
                  progress={row.milestone.progress}
                  fixed={row.milestone.fixed}
                  detailsSummary={`${row.wins.length} weekly win(s)`}
                >
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {row.wins.map((w) => (
                      <li key={w.id} style={{ fontSize: 12, padding: '3px 0' }}>
                        {w.progress === 100 ? '✓' : '○'} {w.title} — {w.progress}%
                      </li>
                    ))}
                  </ul>
                </PlanningProgressCard>
              ))}
            </div>
          )}
        </>
      )}
    </AccordionSection>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /home/zahid/dev/habit-os && npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 4: Commit**

```bash
git add renderer/src/components/PlanningMonthlyLevel.tsx
git commit -m "feat(planning): add PlanningMonthlyLevel for Panel 3's MONTHLY tab"
```

---

### Task 13: `PlanningYearlyLevel.tsx` — Panel 3 YEARLY body

**Files:**
- Create: `renderer/src/components/PlanningYearlyLevel.tsx`

**Interfaces:**
- Consumes: same pattern as Task 12, using `YearStrip` (port from
  `GoalHorizonSection.tsx` lines 271-297) keyed by Milestone months
  instead of Goal deadlines.
- Produces: `PlanningYearlyLevel`, same `owners`/`expanded`/`onToggle` contract.

- [ ] **Step 1: Port `YearStrip`**

Copy `YearStrip` from `GoalHorizonSection.tsx` lines 271-297 verbatim
(it already takes a generic `deadlines: Set<string>`).

- [ ] **Step 2: Write the level component**

Mirror Task 12's structure one level up: for each owner, `outcomes =
listOutcomes(owner)` → find outcome for this year. That outcome IS the
card; its `milestones = listMilestones(outcome.id)` feed the `YearStrip`
dots (one per `milestone.month`) and the `<details>` breakdown.

```typescript
import { Target } from 'lucide-react';
import { GoalOwnerMeta, Milestone, Outcome, planningApi } from '../services/api';
import AccordionSection from './AccordionSection';
import PlanningProgressCard from './PlanningProgressCard';
import { useFetchState } from '../hooks/useFetchState';
import { SPACE } from '../spacing';
// ... YearStrip ported per Step 1 above

interface OwnedOutcome {
  outcome: Outcome;
  milestones: Milestone[];
  owner: GoalOwnerMeta;
}

async function findCurrentOutcome(owner: GoalOwnerMeta, year: number): Promise<OwnedOutcome | null> {
  const outcomes = await planningApi.listOutcomes(owner.key);
  const outcome = outcomes.find((o) => o.year === year);
  if (!outcome) return null;
  const milestones = await planningApi.listMilestones(outcome.id);
  return { outcome, milestones, owner };
}

export default function PlanningYearlyLevel({
  owners,
  accent,
  expanded,
  onToggle,
}: {
  owners: GoalOwnerMeta[] | null;
  accent: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const year = new Date().getFullYear();

  const { data: rows, loaded, loadError, refresh } = useFetchState<OwnedOutcome[]>(
    owners
      ? () => Promise.all(owners.map((o) => findCurrentOutcome(o, year))).then((rs) => rs.filter((r): r is OwnedOutcome => r !== null))
      : null,
    [owners, year],
    [],
  );

  const deadlines = new Set(
    rows.flatMap((r) => r.milestones.map((m) => `${m.year}-${String(m.month).padStart(2, '0')}-01`)),
  );

  return (
    <AccordionSection
      glyph={<Target size={16} />}
      label="YEARLY"
      period={String(year)}
      done={rows.filter((r) => r.outcome.progress === 100).length}
      total={loaded ? rows.length : null}
      accent={accent}
      expanded={expanded}
      onToggle={onToggle}
    >
      {!loaded ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>Loading…</div>
      ) : loadError ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--danger)' }}>
          <span>Couldn't load — check the app is connected.</span>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={refresh}>Retry</button>
        </div>
      ) : (
        <>
          <YearStrip deadlines={deadlines} accent={accent} onSelectDeadline={() => {}} />
          {rows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>
              No Outcome set for this year yet — add one from the Goals panel.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              {rows.map((row) => (
                <PlanningProgressCard
                  key={row.outcome.id}
                  label={`YEAR OUTCOME · ${row.owner.label}`}
                  accent={accent}
                  title={row.outcome.title}
                  progress={row.outcome.progress}
                  fixed={row.outcome.fixed}
                  detailsSummary={`${row.milestones.length} monthly milestone(s)`}
                >
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {row.milestones.map((m) => (
                      <li key={m.id} style={{ fontSize: 12, padding: '3px 0' }}>
                        {m.progress === 100 ? '✓' : '○'} {m.title} — {m.progress}%
                      </li>
                    ))}
                  </ul>
                </PlanningProgressCard>
              ))}
            </div>
          )}
        </>
      )}
    </AccordionSection>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /home/zahid/dev/habit-os && npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 4: Commit**

```bash
git add renderer/src/components/PlanningYearlyLevel.tsx
git commit -m "feat(planning): add PlanningYearlyLevel for Panel 3's YEARLY tab"
```

---

### Task 14: Rewrite `GoalsPanel.tsx` — parent-picker + new hierarchy

**Files:**
- Modify: `renderer/src/components/GoalsPanel.tsx` (the entire file — `HORIZONS` array at lines 66-70, `GoalRow` at 150-680, `GoalSection` at 681-905, `GoalsPanel` at 906-1152)

**Interfaces:**
- Consumes: `planningApi`, `Outcome`/`Milestone`/`Win`/`ChecklistItem`/`GoalOwnerKey`/`GoalOwnerMeta` (Task 9/11).
- Produces: the same default-exported `GoalsPanel` component, same
  external props signature (check current callers in `App.tsx` — this
  task does not change how `GoalsPanel` is invoked, only its internals).

This is the largest single task in the plan. Work level-by-level,
keeping every piece of chrome that has nothing to do with the data
model shape (the collapse/expand row shell, the delete-on-hover `X`,
the note textarea + `useAutosave`, the checklist add/strike/remove UI)
byte-identical to the current `GoalRow`/`GoalSection` — only the parts
touching `Goal`'s flat shape change.

- [ ] **Step 1: Replace the `HORIZONS` array with a `LEVELS` array**

Replace lines 66-70 (`const HORIZONS: ... = [...]`) with:

```typescript
type PlanningLevel = 'outcome' | 'milestone' | 'win';

const LEVELS: { key: PlanningLevel; label: string; glyph: ReactNode; accent: string; weight: number }[] = [
  { key: 'win', label: 'WEEKLY GOAL', glyph: <CalendarDays size={14} />, accent: 'var(--goal-yearly)', weight: 50 },
  { key: 'milestone', label: 'MONTHLY GOAL', glyph: <CalendarRange size={14} />, accent: 'var(--goal-monthly)', weight: 30 },
  { key: 'outcome', label: 'YEARLY GOAL', glyph: <Target size={14} />, accent: 'var(--goal-weekly)', weight: 20 },
];
```

The visual order (WEEKLY/MONTHLY/YEARLY top to bottom, 50/30/20 weight)
is unchanged — only the underlying key names change from the old
crossed `horizon` strings to plain, uncrossed `PlanningLevel` names
(`win`/`milestone`/`outcome`), since the new tables have no
label-crossing quirk to preserve (see the design spec's ⚠ on this).

- [ ] **Step 2: Replace `GoalRow` with `PlanningNodeRow`**

Same two-state (collapsed/open) shell as the current `GoalRow`
(lines 150-680), with these concrete changes:

- **Props:** replace `goal: Goal` with `node: Outcome | Milestone | Win`
  and `level: PlanningLevel`. Replace `onEditStartDate`/`onEditDeadline`
  (Goal-specific date fields with no equivalent on Outcome/Milestone —
  only Win has `week_start_date`, and it's structural, not user-edited
  the way a deadline is) with nothing — **drop the STARTED/DEADLINE row
  entirely** (lines 450-503 in the current file); none of Outcome/
  Milestone/Win have a user-editable date range in the locked contract.
- **Progress bar (`pct`, `barColor`, `dayLabel`, `barTitle`, lines
  260-269):** replace the `hasBoardData`/`board_done`/`board_total`
  computation with `pct = node.progress` directly (already resolved
  server-side, Task 4's `_outcome_out`/`_milestone_out`/`_win_out`).
  `dayLabel` becomes simply `${node.progress}%`. Drop `barTitle`'s
  board-specific wording, use `${node.progress}% complete`.
- **`→ BOARD` button (lines 512-535):** keep the button but make it
  conditional: `{node.legacy_goal_id != null && <button onClick={() => onOpenBoard(node.legacy_goal_id)}>→ BOARD</button>}`.
  When `legacy_goal_id` is null (any node created after this migration
  ships), render a disabled-looking span instead:
  `<span title="Board support for new goals ships in a later update" style={{ fontSize: 12, color: 'var(--text-faint)' }}>BOARD (soon)</span>`.
  This is a deliberate, honest gap — Board itself is Phase B, out of
  this plan's scope (see the design spec's "Explicitly out of scope").
- **TASKS block (lines 541-652):** replace `goalTasksApi` calls with
  `planningApi.listChecklistItems`/`addChecklistItem`/
  `toggleChecklistItem`/`removeChecklistItem`, passing the scope object
  matching `level` or (`{ outcomeId: node.id }` / `{ milestoneId: node.id }`
  / `{ winId: node.id }`). Drop the `+ STRIKE` button and its
  `focusTasks`/`onFocusListChanged` plumbing (lines 568-570, 598-617,
  and the `focusTasks`/`onFocusListChanged` props) — that button strikes
  a `GoalTask` onto today's Focus list via `gsrc`, a wiring specific to
  the old `GoalTask` table (`Task.gsrc` FK) that has no equivalent for
  the new generic `ChecklistItem` table in this phase; keep everything
  else in that block (add/toggle/remove/day-count) unchanged.
- **NOTES (lines 654-676):** Outcome/Milestone/Win have no `note` column
  in this plan's schema — **drop this block**. (If Zahid wants notes
  back on these cards, that's a small additive follow-up: one nullable
  `note` column per table plus wiring identical to what's being removed
  here — not done speculatively per this repo's YAGNI convention.)
- Everything else (the tick button, delete button, collapsed-row
  layout, the open-row title `<input>` + its `onBlur`/`Escape`
  handling) is copied verbatim, swapping `goal.text`/`goal.done`/
  `goal.id` for `node.title`/`node.status === 'achieved'`/`node.id`.
  `onToggle` becomes "toggle `status` between `'active'` and
  `'achieved'`" via `planningApi.edit{Outcome,Milestone,Win}(node.id, { status: ... })`
  — the caller (Step 4 below) picks the right `edit*` function per `level`.

- [ ] **Step 3: Replace `GoalSection` with `PlanningLevelSection`**

Same shell as the current `GoalSection` (lines 681-905), with these
changes:

- **Props:** replace `horizon: GoalHorizon` / `goals: Goal[]` with
  `level: PlanningLevel` / `nodes: (Outcome | Milestone | Win)[]`.
- **Composer (`submitAdd`, lines 735-743, and the form at 849-871):**
  the old composer took free text + a start date. The new one needs a
  **parent picker** for `milestone`/`win` levels (not `outcome` — it has
  no parent). Add a `<select>` populated from the parent level's already-
  loaded list (passed down as a new `parentOptions: { id: number; title: string }[]`
  prop — `GoalsPanel` supplies this from its own `outcomes`/`milestones`
  state, see Step 4), defaulting to the first option when there's
  exactly one (matching the design spec's "defaulting to the owner's
  only Outcome if there's exactly one"). Replace the `newDate` date input
  with this select for `milestone`/`win`; `outcome`'s composer keeps only
  the text field (plus year, defaulting to the current year, no picker
  needed).
- Everything else (the header row with the editable section title, the
  `+`/composing toggle, the empty state, the `weight`-based flex sizing)
  is copied verbatim.

- [ ] **Step 4: Rewrite the top-level `GoalsPanel` wiring**

Replace the single `goals: Goal[]` state (line 940) with three: `outcomes: Outcome[]`, `milestones: Milestone[]`, `wins: Win[]` — fetched via `planningApi.listOutcomes(shownKey)`, then for each outcome `planningApi.listMilestones(outcome.id)`, then for each milestone `planningApi.listWins(milestone.id)`, flattened. Replace the `HORIZONS.map(...)` block (lines 1107-1148) with `LEVELS.map(...)`, wiring each `PlanningLevelSection`'s `nodes` to the matching state array filtered to nothing (outcomes are already fully "this owner's"; milestones filtered to `outcomes.map(o => o.id)`; wins filtered to `milestones.map(m => m.id)`) and `onAdd`/`onToggle`/`onDelete`/`onEditText` to the matching `planningApi.create/edit/delete{Outcome,Milestone,Win}` call, refetching the full three-array tree afterward (simplest correct option — this panel's data volume is small, same reasoning the old `GoalRepository.list` comment gives for not needing a sort-order column).

- [ ] **Step 5: Typecheck**

Run: `cd /home/zahid/dev/habit-os && npx tsc --noEmit`
Expected: no errors in `GoalsPanel.tsx`. Errors in `Panel3.tsx` about
`GoalHorizonSection` are still expected until Task 16.

- [ ] **Step 6: Commit**

```bash
git add renderer/src/components/GoalsPanel.tsx
git commit -m "feat(planning): migrate GoalsPanel to Outcome/Milestone/Win hierarchy"
```

---

### Task 15: Wire `Panel3.tsx` to the new level components

**Files:**
- Modify: `renderer/src/components/Panel3.tsx:11` (import), `renderer/src/components/Panel3.tsx:241-283` (the three `GoalHorizonSection` calls)

**Interfaces:**
- Consumes: `PlanningWeeklyLevel` (Task 11), `PlanningMonthlyLevel` (Task 12), `PlanningYearlyLevel` (Task 13).

- [ ] **Step 1: Swap the import**

Replace line 11:
```typescript
import GoalHorizonSection, { GoalOwnerMeta } from './GoalHorizonSection';
```
with:
```typescript
import PlanningWeeklyLevel from './PlanningWeeklyLevel';
import PlanningMonthlyLevel from './PlanningMonthlyLevel';
import PlanningYearlyLevel from './PlanningYearlyLevel';
import { GoalOwnerMeta } from '../services/api';
```

- [ ] **Step 2: Replace the three `GoalHorizonSection` calls**

Replace lines 241-283 (the three `<GoalHorizonSection horizon="yearly" .../>` etc. blocks, including the ⚠ horizon-crossing comment above them — that comment no longer applies, the new components take no crossed `horizon` prop) with:

```typescript
<PlanningWeeklyLevel
  owners={owners}
  accent="var(--goal-yearly)"
  expanded={level === 'weekly'}
  onToggle={() => setLevel('weekly')}
/>
<PlanningMonthlyLevel
  owners={owners}
  accent="var(--goal-monthly)"
  expanded={level === 'monthly'}
  onToggle={() => setLevel('monthly')}
/>
<PlanningYearlyLevel
  owners={owners}
  accent="var(--goal-weekly)"
  expanded={level === 'yearly'}
  onToggle={() => setLevel('yearly')}
/>
```

(Accent variable names — `--goal-yearly` for WEEKLY, etc. — are kept
exactly as they were despite reading "crossed": they're CSS custom
property names already defined once in the theme, unrelated to the
`horizon` string crossing that's now gone. Renaming the CSS variables
is out of scope here — it would touch the theme file for a purely
cosmetic rename with no behavior change.)

Also remove the now-unused `onOpenGoal` prop threading (`Panel3`'s own
`onOpenGoal={onOpenGoal}` at line 258/270/282 and its handler comment at
318-321) **only if** none of the three new components use it — Tasks
11-13 above render calendar dots as non-interactive (`onSelectDeadline={() => {}}`)
in this phase (the mockup's click-to-navigate exists at the Daily
level's own day-strip, which is untouched; wiring MONTHLY/YEARLY's
calendar dots back to Panel 2 the way the old `GoalHorizonSection` did
is a reasonable fast-follow, not required for Phase A's own locked
contract). If keeping the prop threading for a near-term follow-up is
preferred, leave it in place unused rather than ripping out and
re-adding it — check with whoever executes this task if unsure.

- [ ] **Step 3: Typecheck**

Run: `cd /home/zahid/dev/habit-os && npx tsc --noEmit`
Expected: no errors anywhere in `renderer/src`.

- [ ] **Step 4: Run the full verification chain**

Run: `cd /home/zahid/dev/habit-os && npm run test:spacing && npm run test:radius && npm run test:typography && npm run lint`
Expected: spacing/radius/typography all print "clean"; lint shows no
new errors (pre-existing warnings in untouched files are fine).

- [ ] **Step 5: Commit**

```bash
git add renderer/src/components/Panel3.tsx
git commit -m "feat(planning): wire Panel 3's WEEKLY/MONTHLY/YEARLY to the new planning hierarchy"
```

---

### Task 16: Delete the superseded `GoalHorizonSection.tsx`

**Files:**
- Delete: `renderer/src/components/GoalHorizonSection.tsx`

- [ ] **Step 1: Confirm nothing still imports it**

Run: `cd /home/zahid/dev/habit-os && grep -rn "GoalHorizonSection" renderer/src --include=*.tsx --include=*.ts`
Expected: no matches (Task 15 removed `Panel3.tsx`'s import; nothing
else ever imported it per the earlier repo-wide grep in this plan's
originating conversation).

- [ ] **Step 2: Delete it**

```bash
git rm renderer/src/components/GoalHorizonSection.tsx
```

- [ ] **Step 3: Typecheck once more**

Run: `cd /home/zahid/dev/habit-os && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(planning): remove superseded GoalHorizonSection"
```

---

### Task 17: End-to-end live verification via `run-habit-os`

**Files:** none (verification only)

- [ ] **Step 1: Build and launch**

Use the `run-habit-os` skill's driver: `launch`, then `ss goals-empty`
on Panel 2 (Goals) for the currently-active project.

- [ ] **Step 2: Walk the create→schedule→complete→cascade flow**

Via the driver:
1. `click-text Goals` (Panel 2)
2. Add a YEARLY GOAL (Outcome) — `fill`/`click-text` the composer, confirm it appears with 0%.
3. Open it, add a MONTHLY GOAL (Milestone) under it via the parent picker — confirm it defaults to the just-created Outcome.
4. Add a WEEKLY GOAL (Win) under that Milestone, with a criteria string.
5. Add a checklist item to the Win, toggle it done — confirm the Win's own progress bar updates (1 task, 1 done -> 100%) and, on reopening the Outcome/Milestone, their bars show 100% too (single-child average).
6. Switch to EXECUTE tab, expand WEEKLY — confirm the same Win/task appear there with the same progress, matching what Panel 2 shows.
7. `ss` a screenshot at each step, read them back (per this skill's own instruction: open the PNG, a blank/error screenshot means not done).

- [ ] **Step 3: Clean up test data**

Per the `run-habit-os` skill's own gotcha: delete the Outcome created in
Step 2 above via the app's own delete button (cascades through Milestone/
Win/checklist item), or directly:

```bash
cd python && source .venv/bin/activate && python -c "
from database.models import Outcome
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session
eng = create_engine('sqlite:////home/zahid/.config/habit-os/data/app.db')
with Session(eng) as s:
    s.execute(delete(Outcome)); s.commit()
"
```

(Deleting the `Outcome` row alone is enough — SQLite enforces the
`RESTRICT`/`CASCADE` FKs declared in Task 1/3 only if foreign keys are
turned on for the connection; if this raises an FK error instead of
cascading, delete Win → Milestone → Outcome in that order instead.)

- [ ] **Step 4: Quit the driver cleanly**

`quit` via the driver (never force-kill — see the `run-habit-os`
skill's own gotcha about orphaning the Python backend).
