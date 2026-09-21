"""add q90 area meta

Revision ID: 2075492ac795
Revises: d9c4b7a5e3f1
Create Date: 2026-09-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2075492ac795'
down_revision: Union[str, Sequence[str], None] = 'd9c4b7a5e3f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "q90_area_meta",
        sa.Column("area_key", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False, server_default=""),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.PrimaryKeyConstraint("area_key"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("q90_area_meta")
