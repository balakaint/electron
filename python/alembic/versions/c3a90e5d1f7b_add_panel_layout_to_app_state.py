"""add panel_layout to app_state

Legacy's progressive panel layout, reduced to the two rungs this port's
structure can carry: "full" and "compact". Legacy's third state,
"partial", is not ported — it means "panel 1 hidden, panel 2 shown" in a
three-column window, and the port shows one page at a time, so there is
no such state to be in. See docs/ROW10_LAYOUT_NOTE.md.

Defaults to "full", which is how the port has always opened.

Revision ID: c3a90e5d1f7b
Revises: b7d2f81c4a35
Create Date: 2026-09-06

"""
from alembic import op
import sqlalchemy as sa

revision: str = 'c3a90e5d1f7b'
down_revision: str | None = 'b7d2f81c4a35'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_state",
        sa.Column("panel_layout", sa.String(), nullable=False, server_default="full"),
    )


def downgrade() -> None:
    op.drop_column("app_state", "panel_layout")
