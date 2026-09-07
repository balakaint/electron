"""add note_title to projects

Legacy's `_qn_title_<projkey>`: the Quick Notes heading on a project card
is renameable, and legacy explicitly preserves those renames through
save_data (580-587). The port had no column for it, so every card showed
the fixed heading "QUICK NOTES" and any rename in an imported save file
was dropped.

Empty means "use the default heading", not "blank heading".

Revision ID: d5f1a83c60e2
Revises: c3a90e5d1f7b
Create Date: 2026-09-07

"""
from alembic import op
import sqlalchemy as sa

revision: str = 'd5f1a83c60e2'
down_revision: str | None = 'c3a90e5d1f7b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("note_title", sa.String(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("projects", "note_title")
