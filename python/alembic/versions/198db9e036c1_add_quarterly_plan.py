"""add 90-day quarterly plan

Revision ID: 198db9e036c1
Revises: c9ce19d69cbf
Create Date: 2026-09-06 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '198db9e036c1'
down_revision: Union[str, Sequence[str], None] = 'c9ce19d69cbf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "quarterly_answers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cycle_start", sa.String(), nullable=False),
        sa.Column("area", sa.String(), nullable=False),
        sa.Column("out", sa.String(), nullable=False, server_default=""),
        sa.Column("act", sa.String(), nullable=False, server_default=""),
        sa.Column("ifthen", sa.String(), nullable=False, server_default=""),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cycle_start", "area", name="uq_qplan_cycle_area"),
    )
    op.add_column("app_state", sa.Column("q90_cycle_start", sa.String(), nullable=True))
    op.add_column("app_state", sa.Column("q90_cycle_days", sa.Integer(), nullable=False, server_default="90"))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("app_state", "q90_cycle_days")
    op.drop_column("app_state", "q90_cycle_start")
    op.drop_table("quarterly_answers")
