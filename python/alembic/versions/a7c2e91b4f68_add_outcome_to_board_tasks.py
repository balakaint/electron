"""add outcome (Definition of Done) to board_tasks

Revision ID: a7c2e91b4f68
Revises: f0b918f2854d

Zahid asked for a one-line "what finishes this task" statement at the
top of each task's Individual Task Board, after comparing the overlay
to the standalone `ele kanban` pilot's own Focus Board header
(milestone ladder / units sold / target date — that pilot's own
venture-tracking widgets, not something reused here). This is that
line, scoped to one BoardTask.
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'a7c2e91b4f68'
down_revision: str | None = 'f0b918f2854d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('board_tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('outcome', sa.String(), nullable=False, server_default=''))


def downgrade() -> None:
    with op.batch_alter_table('board_tasks', schema=None) as batch_op:
        batch_op.drop_column('outcome')
