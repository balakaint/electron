"""transformation: focus area + weekly routine checks

Revision ID: c7e9a1b3d5f6
Revises: b6d8f0a2c4e5
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'c7e9a1b3d5f6'
down_revision: str | None = 'b6d8f0a2c4e5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('app_state', sa.Column('q90_focus_area', sa.String(), nullable=True))
    op.add_column('quarterly_answers', sa.Column('week_checks', sa.JSON(), nullable=False, server_default='[]'))


def downgrade() -> None:
    with op.batch_alter_table('quarterly_answers') as batch:
        batch.drop_column('week_checks')
    with op.batch_alter_table('app_state') as batch:
        batch.drop_column('q90_focus_area')
