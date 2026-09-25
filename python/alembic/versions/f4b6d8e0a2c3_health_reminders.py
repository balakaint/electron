"""health reminders settings

Revision ID: f4b6d8e0a2c3
Revises: e3a5c7d9f1b2
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'f4b6d8e0a2c3'
down_revision: str | None = 'e3a5c7d9f1b2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('health_profile', sa.Column('reminders', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('health_profile') as batch:
        batch.drop_column('reminders')
