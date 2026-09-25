"""health progress (measures, goal weight) + shopping list

Revision ID: e3a5c7d9f1b2
Revises: d2f4a6b8c913
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'e3a5c7d9f1b2'
down_revision: str | None = 'd2f4a6b8c913'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('health_profile', sa.Column('goal_weight_kg', sa.Float(), nullable=True))
    op.create_table(
        'health_measure',
        sa.Column('day', sa.String(), primary_key=True),
        sa.Column('weight_kg', sa.Float(), nullable=True),
        sa.Column('waist_cm', sa.Float(), nullable=True),
        sa.Column('hip_cm', sa.Float(), nullable=True),
    )
    op.create_table(
        'health_shop_item',
        sa.Column('week', sa.String(), primary_key=True),
        sa.Column('name', sa.String(), primary_key=True),
        sa.Column('custom', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('qty', sa.String(), nullable=False, server_default=''),
        sa.Column('bought', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_table('health_shop_item')
    op.drop_table('health_measure')
    with op.batch_alter_table('health_profile') as batch:
        batch.drop_column('goal_weight_kg')
