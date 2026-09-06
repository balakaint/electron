"""add task list heading titles to app_state

Revision ID: 4962110884dd
Revises: c6586ce94651
Create Date: 2026-09-06 21:50:02.521849

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4962110884dd'
down_revision: Union[str, Sequence[str], None] = 'c6586ce94651'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("app_state", sa.Column("task_title_classic_today", sa.String(), nullable=True))
    op.add_column("app_state", sa.Column("task_title_classic_tomorrow", sa.String(), nullable=True))
    op.add_column("app_state", sa.Column("task_title_focus_today", sa.String(), nullable=True))
    op.add_column("app_state", sa.Column("task_title_focus_tomorrow", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("app_state", "task_title_focus_tomorrow")
    op.drop_column("app_state", "task_title_focus_today")
    op.drop_column("app_state", "task_title_classic_tomorrow")
    op.drop_column("app_state", "task_title_classic_today")
