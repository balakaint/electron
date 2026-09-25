"""board: tasks belong to a project (the board moves to the project card)

Revision ID: d8f0b2c4e6a7
Revises: c7e9a1b3d5f6

The Individual Task Board used to hang off a legacy Goal only, which
new goals (planning ladder) never have — so every goal made after that
migration showed "BOARD (soon)" and could not open one. The board now
lives on the project card: board_tasks gain a project_key, backfilled
from the goal each existing task sits under (so nothing already on a
board is lost), and goal_id becomes optional — a task added from the
project's board has no goal.

Alembic's own engine has no PRAGMA foreign_keys, so rebuilding
board_tasks here does not cascade-delete board_cards (checked by
test_board_project.py).
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'd8f0b2c4e6a7'
down_revision: str | None = 'c7e9a1b3d5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('board_tasks', sa.Column('project_key', sa.String(), nullable=True))
    op.execute(
        "UPDATE board_tasks SET project_key = "
        "(SELECT goals.project_key FROM goals WHERE goals.id = board_tasks.goal_id)"
    )
    with op.batch_alter_table('board_tasks') as batch:
        batch.alter_column('goal_id', existing_type=sa.Integer(), nullable=True)
        batch.create_index('ix_board_tasks_project_key', ['project_key'])


def downgrade() -> None:
    # Tasks added from a project's board have no goal to go back under.
    op.execute("DELETE FROM board_tasks WHERE goal_id IS NULL")
    with op.batch_alter_table('board_tasks') as batch:
        batch.drop_index('ix_board_tasks_project_key')
        batch.alter_column('goal_id', existing_type=sa.Integer(), nullable=False)
        batch.drop_column('project_key')
