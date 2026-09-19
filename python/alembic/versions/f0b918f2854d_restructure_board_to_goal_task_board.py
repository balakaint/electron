"""restructure Board to Goal -> Task -> Individual Task Board

Revision ID: f0b918f2854d
Revises: 48d822248fb2

Supersedes the flat per-project Focus Board (project_key-scoped
board_cards, with an optional goal_id backlink added in
48d822248fb2). The user corrected the design: a Goal breaks into
several Tasks, and each Task gets its own separate 3-column board —
not one board per project grouped by goal. So this migration:

  1. adds a new `board_tasks` table (goal_id FK, ondelete="CASCADE" —
     a task has no meaning without its goal)
  2. drops the old flat `board_cards` table entirely and recreates it
     scoped to `task_id` (ondelete="CASCADE") instead of `project_key`,
     dropping the old optional `goal_id` backlink column

This is a destructive migration for any board_cards rows created under
the old flat design (pre-launch dev/test data only — Zahid was told
this in the chat before running it).
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'f0b918f2854d'
down_revision: str | None = '48d822248fb2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_table('board_cards')

    op.create_table(
        'board_tasks',
        sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['goal_id'], ['goals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'board_cards',
        sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('col', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('note', sa.String(), nullable=False),
        sa.Column('priority', sa.String(), nullable=False),
        sa.Column('pinned', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['board_tasks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('board_cards')
    op.drop_table('board_tasks')

    op.create_table(
        'board_cards',
        sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('project_key', sa.String(), nullable=False),
        sa.Column('col', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('note', sa.String(), nullable=False),
        sa.Column('priority', sa.String(), nullable=False),
        sa.Column('pinned', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['project_key'], ['projects.key']),
        sa.ForeignKeyConstraint(['goal_id'], ['goals.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
