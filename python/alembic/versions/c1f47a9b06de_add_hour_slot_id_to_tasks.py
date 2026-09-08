"""link a task back to the hour-plan row it was started from

Revision ID: c1f47a9b06de
Revises: b8c15d3e0a72
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'c1f47a9b06de'
down_revision: str | None = 'b8c15d3e0a72'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable with no default: the overwhelming majority of tasks have
    # nothing to do with the hour plan, and NULL is the honest way to say
    # "not started from an hour" — a 0 would collide with hour_slots.id
    # numbering the moment the table has a row 0.
    op.add_column('tasks', sa.Column('hour_slot_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('tasks', 'hour_slot_id')
