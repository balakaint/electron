"""add mindset to daily_intentions

Legacy's `__mindset_<day>` key — the note behind the PLAN screen's
Mindset tab. It is a separate field from `text` (the "TODAY I WILL"
intention): legacy stores them under different keys and shows them on
different surfaces, so folding one into the other would overwrite real
writing on import.

Note this column was missing from import_legacy's per-day text prefix
list as well, so these notes were being dropped silently on import. That
is fixed in the same change.

Revision ID: b7d2f81c4a35
Revises: a1c4e7f20b91
Create Date: 2026-09-06

"""
from alembic import op
import sqlalchemy as sa

revision: str = 'b7d2f81c4a35'
down_revision: str | None = 'a1c4e7f20b91'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "daily_intentions",
        sa.Column("mindset", sa.String(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("daily_intentions", "mindset")
