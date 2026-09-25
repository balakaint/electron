"""tasks.done_at — when a task was finished (TASK LIST Done filter)

Revision ID: a5c7e9f1b3d4
Revises: f4b6d8e0a2c3
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'a5c7e9f1b3d4'
down_revision: str | None = 'f4b6d8e0a2c3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('done_at', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('tasks') as batch:
        batch.drop_column('done_at')
