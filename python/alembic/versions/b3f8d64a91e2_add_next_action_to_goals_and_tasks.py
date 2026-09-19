"""add next_action to goals and board_tasks

Revision ID: b3f8d64a91e2
Revises: a7c2e91b4f68

From Zahid's visual-hierarchy review of the Goal editor and the
Individual Task Board: knowing the goal and knowing the task doesn't
solve procrastination — each needs its own single, immediately
executable "next physical action" line, separate from free-form notes.
Two columns because the two scopes are genuinely different (a goal not
yet broken into tasks still needs a next action; a task's board also
needs its own, narrower one) — not a duplicate of the same field.
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'b3f8d64a91e2'
down_revision: str | None = 'a7c2e91b4f68'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('goals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('next_action', sa.String(), nullable=False, server_default=''))
    with op.batch_alter_table('board_tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('next_action', sa.String(), nullable=False, server_default=''))


def downgrade() -> None:
    with op.batch_alter_table('board_tasks', schema=None) as batch_op:
        batch_op.drop_column('next_action')
    with op.batch_alter_table('goals', schema=None) as batch_op:
        batch_op.drop_column('next_action')
