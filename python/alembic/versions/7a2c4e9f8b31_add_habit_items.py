"""add habit items

Revision ID: 7a2c4e9f8b31
Revises: 6ddee1ed777a
Create Date: 2026-09-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a2c4e9f8b31'
down_revision: Union[str, Sequence[str], None] = '6ddee1ed777a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "habit_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("time", sa.String(), nullable=False, server_default=""),
        sa.Column("priority", sa.String(), nullable=False, server_default="normal"),
        sa.Column("tracking_basis", sa.String(), nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("history", sa.JSON(), nullable=False, server_default="[]"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("habit_items")
