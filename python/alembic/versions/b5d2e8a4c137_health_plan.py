"""health plan: profile + day log

Revision ID: b5d2e8a4c137
Revises: a3c8e51f7d20
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'b5d2e8a4c137'
down_revision: str | None = 'a3c8e51f7d20'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'health_profile',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('age', sa.Integer(), nullable=False),
        sa.Column('sex', sa.String(), nullable=False),
        sa.Column('height_cm', sa.Float(), nullable=False),
        sa.Column('weight_kg', sa.Float(), nullable=False),
        sa.Column('goal', sa.String(), nullable=False),
        sa.Column('activity', sa.String(), nullable=False),
        sa.Column('place', sa.String(), nullable=False, server_default='home'),
        sa.Column('start_date', sa.String(), nullable=False),
        sa.Column('weeks', sa.Integer(), nullable=False, server_default='4'),
    )
    op.create_table(
        'health_day_log',
        sa.Column('day', sa.String(), primary_key=True),
        sa.Column('meals', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('moves', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('water', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_table('health_day_log')
    op.drop_table('health_profile')
