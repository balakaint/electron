"""revert focus_tab to three tabs

Revision ID: c9a1f4d872e6
Revises: b2f7a83c9e14
Create Date: 2026-09-22 00:00:00.000000

The user asked to simplify the EXECUTE redesign: keep the original three
tabs (HOURS/MIT/LIST) exactly as they were, and nest the new DAILY/
WEEKLY/MONTHLY/YEARLY accordion inside the HOURS tab instead of
replacing the tab strip with it (see Panel3.tsx). That inner accordion's
expanded level is deliberately NOT persisted (in-memory only, same
convention HourPlanTab already uses for its phase-block open state), so
focus_tab goes back to meaning exactly what it meant before b2f7a83c9e14
— this migration is that revert, symmetric with b2f7a83c9e14's own
downgrade().
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9a1f4d872e6'
down_revision: Union[str, Sequence[str], None] = 'b2f7a83c9e14'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


app_state = sa.table('app_state', sa.column('focus_tab', sa.String()))


def upgrade() -> None:
    op.execute(
        app_state.update()
        .where(app_state.c.focus_tab.in_(('daily', 'weekly', 'monthly', 'yearly')))
        .values(focus_tab='hours')
    )
    with op.batch_alter_table('app_state', schema=None) as batch_op:
        batch_op.alter_column('focus_tab', server_default='hours')


def downgrade() -> None:
    op.execute(
        app_state.update()
        .where(app_state.c.focus_tab.in_(('hours', 'mit', 'list')))
        .values(focus_tab='daily')
    )
    with op.batch_alter_table('app_state', schema=None) as batch_op:
        batch_op.alter_column('focus_tab', server_default='daily')
