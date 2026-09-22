"""rewrite focus_tab to accordion levels

Revision ID: b2f7a83c9e14
Revises: b47e9f21c6a3
Create Date: 2026-09-22 00:00:00.000000

EXECUTE's old three tabs (hours/mit/list) became four accordion levels
(daily/weekly/monthly/yearly) — MIT folded into an inline NOW expand and
LIST became a "Tomorrow" popover, so neither survives as its own level.
Rewrites any existing stored value to the nearest equivalent: hours/mit/
list all fall back to "daily", the new default.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2f7a83c9e14'
down_revision: Union[str, Sequence[str], None] = 'b47e9f21c6a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


app_state = sa.table('app_state', sa.column('focus_tab', sa.String()))


def upgrade() -> None:
    op.execute(
        app_state.update()
        .where(app_state.c.focus_tab.in_(('hours', 'mit', 'list')))
        .values(focus_tab='daily')
    )
    with op.batch_alter_table('app_state', schema=None) as batch_op:
        batch_op.alter_column('focus_tab', server_default='daily')


def downgrade() -> None:
    op.execute(
        app_state.update()
        .where(app_state.c.focus_tab.in_(('daily', 'weekly', 'monthly', 'yearly')))
        .values(focus_tab='hours')
    )
    with op.batch_alter_table('app_state', schema=None) as batch_op:
        batch_op.alter_column('focus_tab', server_default='hours')
