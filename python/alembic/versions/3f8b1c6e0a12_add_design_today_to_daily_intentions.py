"""add design_today to daily_intentions

Revision ID: 3f8b1c6e0a12
Revises: 26f6de8766a5
Create Date: 2026-09-18

The Discipline tab's morning brain-dump box (Zahid's own framing: at
5am the mind is empty, and by the time it fills up the plan for the day
should already be written down). A separate column from `mindset` for
the same reason `mindset` itself got a separate column rather than
folding into `text` (see b7d2f81c4a35) — different box, different
surface, and merging the two would let one silently overwrite the
other on a future import.
"""
from alembic import op
import sqlalchemy as sa

revision: str = '3f8b1c6e0a12'
down_revision: str | None = '26f6de8766a5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "daily_intentions",
        sa.Column("design_today", sa.String(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("daily_intentions", "design_today")
