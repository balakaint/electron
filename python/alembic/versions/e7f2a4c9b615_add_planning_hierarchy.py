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
