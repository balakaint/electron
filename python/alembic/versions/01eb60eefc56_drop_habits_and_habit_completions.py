"""drop habits and habit_completions

Revision ID: 01eb60eefc56
Revises: 7c8574ed82d2

Removes the flat Money/Health/Relation/Mind habit checklist tables
outright — Zahid's own call (2026-09-14): "emon task list mainly regular
chek kora hoy na" (that kind of list wasn't actually being checked
regularly). This also retires the whole-app "Life Execution Board"
(HabitDashboard.tsx, reached from the Tools menu), which showed the same
checklist plus streak/week/monthly scoring; Zahid confirmed removing
that too, after being told it would break, rather than leave the
checklist backend around just to keep it working.

This DOES delete any completion history in `habits`/`habit_completions`
on a real install — Zahid explicitly confirmed removing the backend, not
just the UI, aware this data goes with it (the list wasn't being checked
regularly, so there was little history to lose). Downgrade recreates the
empty table shape (matching migration `8ebdffef9b2e`) but cannot recover
dropped rows — this is a genuinely destructive migration, not a
reversible one in practice.

`daily_intentions` (DailyIntention) is NOT touched here: its `text`/
`win`/`reflection` columns lost their only UI in this same round (it
lived in the now-removed Life Execution Board too) but are left in place
— unlike the habit tables, dropping them would be pure data loss with no
explicit go-ahead from Zahid to lose it, so they're kept, unused, rather
than migrated away. See database/models.py's DailyIntention docstring
for the full reasoning.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '01eb60eefc56'
down_revision: Union[str, Sequence[str], None] = '7c8574ed82d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('habit_completions')
    op.drop_table('habits')


def downgrade() -> None:
    op.create_table(
        'habits',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'habit_completions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('habit_id', sa.Integer(), nullable=False),
        sa.Column('day', sa.String(), nullable=False),
        sa.Column('done', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['habit_id'], ['habits.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('habit_id', 'day', name='uq_habit_day'),
    )
