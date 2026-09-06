"""add win and reflection to daily_intentions

Revision ID: 409c971a35c4
Revises: 6d87d80e77d4
Create Date: 2026-09-06 23:47:07.046579

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '409c971a35c4'
down_revision: Union[str, Sequence[str], None] = '6d87d80e77d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("daily_intentions", sa.Column("win", sa.String(), nullable=False, server_default=""))
    op.add_column("daily_intentions", sa.Column("reflection", sa.String(), nullable=False, server_default=""))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("daily_intentions", "reflection")
    op.drop_column("daily_intentions", "win")
