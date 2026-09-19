"""add deadline to goals

Revision ID: c4e1f7a2b8d5
Revises: b3f8d64a91e2

From Zahid's own request: the goal deadline used to be a pure display
computation (start_date + a hardcoded 30-day window, same for every
horizon) rather than stored state. He asked for it to default per
horizon instead (7 days / 30 days / 12 months, by DISPLAYED label — see
engine.goals._default_deadline's own warning about the crossed
horizon<->label mapping) and be directly editable via a calendar picker,
which means it has to be a real column.

Existing rows get their deadline backfilled from their own horizon and
start_date, computed with the exact same rule new rows get — so an
existing goal's deadline doesn't jump the moment this migration runs,
it just becomes visible/editable instead of implicit.

This file intentionally duplicates engine.goals._add_months /
_default_deadline rather than importing them: a migration has to keep
producing the same result forever, even if that function's rounding
rule changes later for new goals.
"""

import calendar
from datetime import date, timedelta
from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'c4e1f7a2b8d5'
down_revision: str | None = 'b3f8d64a91e2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _add_months(d: date, months: int) -> date:
    total = d.month - 1 + months
    year = d.year + total // 12
    month = total % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _default_deadline(horizon: str, start_date: str) -> str:
    try:
        sd = date.fromisoformat(start_date)
    except ValueError:
        sd = date.today()
    if horizon == 'yearly':  # displayed "WEEKLY GOAL" — 7 days
        return str(sd + timedelta(days=7))
    if horizon == 'monthly':  # displayed "MONTHLY GOAL" — 30 days
        return str(sd + timedelta(days=30))
    return str(_add_months(sd, 12))  # horizon == 'weekly', displayed "YEARLY GOAL"


def upgrade() -> None:
    with op.batch_alter_table('goals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('deadline', sa.String(), nullable=False, server_default=''))

    conn = op.get_bind()
    goals_table = sa.table(
        'goals',
        sa.column('id', sa.Integer),
        sa.column('horizon', sa.String),
        sa.column('start_date', sa.String),
        sa.column('deadline', sa.String),
    )
    rows = conn.execute(sa.select(goals_table.c.id, goals_table.c.horizon, goals_table.c.start_date)).fetchall()
    for row in rows:
        conn.execute(
            goals_table.update()
            .where(goals_table.c.id == row.id)
            .values(deadline=_default_deadline(row.horizon, row.start_date))
        )


def downgrade() -> None:
    with op.batch_alter_table('goals', schema=None) as batch_op:
        batch_op.drop_column('deadline')
