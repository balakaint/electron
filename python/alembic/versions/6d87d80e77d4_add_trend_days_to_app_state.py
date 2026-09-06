"""add trend_days to app_state

Revision ID: 6d87d80e77d4
Revises: 5d50bc296e19
Create Date: 2026-09-06 23:25:55.275334

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6d87d80e77d4'
down_revision: Union[str, Sequence[str], None] = '5d50bc296e19'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("app_state", sa.Column("trend_days", sa.Integer(), nullable=False, server_default="30"))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("app_state", "trend_days")
