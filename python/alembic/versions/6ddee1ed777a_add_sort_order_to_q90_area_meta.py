"""add sort_order to q90 area meta

Revision ID: 6ddee1ed777a
Revises: 2075492ac795
Create Date: 2026-09-21 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6ddee1ed777a'
down_revision: Union[str, Sequence[str], None] = '2075492ac795'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("q90_area_meta", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("q90_area_meta", "sort_order")
