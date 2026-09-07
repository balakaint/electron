"""hour slots that repeat until finished

Revision ID: f2a9c31d7b45
Revises: e7b2c94d1a08
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'f2a9c31d7b45'
down_revision: str | None = 'e7b2c94d1a08'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'hour_slots',
        sa.Column('repeat', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Nullable, and null means "not finished". Existing rows are one-offs
    # so they need no backfill: repeat defaults false and done_day is
    # only read for repeating entries.
    op.add_column('hour_slots', sa.Column('done_day', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('hour_slots', 'done_day')
    op.drop_column('hour_slots', 'repeat')
