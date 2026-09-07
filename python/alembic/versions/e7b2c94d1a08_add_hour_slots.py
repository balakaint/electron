"""add hour_slots for the TODAY hour-by-hour plan

Revision ID: e7b2c94d1a08
Revises: d5f1a83c60e2
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'e7b2c94d1a08'
down_revision: str | None = 'd5f1a83c60e2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'hour_slots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('day', sa.String(), nullable=False),
        sa.Column('hour', sa.Integer(), nullable=False),
        sa.Column('text', sa.String(), nullable=False, server_default=''),
        sa.Column('done', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('day', 'hour', name='uq_hour_slot_day_hour'),
    )


def downgrade() -> None:
    op.drop_table('hour_slots')
