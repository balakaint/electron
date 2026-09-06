"""add bdp_view to app_state

Which of the Business Plan Notes screen's three layouts is showing
("card" | "table" | "list"). Stored beside bdp_sort, and for the same
reason: it is a working preference, not transient UI state — you switch
to "table" to scan twenty plans at once and expect it still to be table
tomorrow.

Defaults to "card", which is the layout the port has always shown, so an
existing database keeps the view its user already knows.

Revision ID: a1c4e7f20b91
Revises: 409c971a35c4
Create Date: 2026-09-06

"""
from alembic import op
import sqlalchemy as sa

revision: str = 'a1c4e7f20b91'
down_revision: str | None = '409c971a35c4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_state",
        sa.Column("bdp_view", sa.String(), nullable=False, server_default="card"),
    )


def downgrade() -> None:
    op.drop_column("app_state", "bdp_view")
