"""add wake_up_time to morning_rituals

Revision ID: 7a2d4f9c1b56
Revises: 3f8b1c6e0a12
Create Date: 2026-09-18

Zahid's request, beside the existing sleep_quality field: what time he
actually woke up, tracked per day the same way sleep_quality already is
— a plain nullable string ("HH:MM"), validated in the engine only, same
convention as sleep_quality itself.
"""
from alembic import op
import sqlalchemy as sa

revision: str = '7a2d4f9c1b56'
down_revision: str | None = '3f8b1c6e0a12'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "morning_rituals",
        sa.Column("wake_up_time", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("morning_rituals", "wake_up_time")
