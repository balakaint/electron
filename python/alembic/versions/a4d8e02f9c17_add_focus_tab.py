"""add focus_tab to app_state

Revision ID: a4d8e02f9c17
Revises: f2a9c31d7b45
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'a4d8e02f9c17'
down_revision: str | None = 'f2a9c31d7b45'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'app_state',
        sa.Column('focus_tab', sa.String(), nullable=False, server_default='hours'),
    )


def downgrade() -> None:
    op.drop_column('app_state', 'focus_tab')
