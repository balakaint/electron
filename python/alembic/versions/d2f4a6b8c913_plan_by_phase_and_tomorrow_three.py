"""plan by phase + tomorrow's three + daily three history

Revision ID: d2f4a6b8c913
Revises: c9e1f3a7b524
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'd2f4a6b8c913'
down_revision: str | None = 'c9e1f3a7b524'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('app_state', sa.Column('plan_adaptive', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('app_state', sa.Column('tomorrow_three', sa.JSON(), nullable=False, server_default='{}'))
    op.add_column('app_state', sa.Column('three_history', sa.JSON(), nullable=False, server_default='{}'))


def downgrade() -> None:
    with op.batch_alter_table('app_state') as batch:
        batch.drop_column('three_history')
        batch.drop_column('tomorrow_three')
        batch.drop_column('plan_adaptive')
