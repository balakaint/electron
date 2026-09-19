"""add morning_rituals

Revision ID: 7c8574ed82d2
Revises: c4e1f7a2b8d5

Adds the morning_rituals table for the new Morning Ritual guided module
(Zahid's Discipline brainstorm, 2026-09-14) — a separate, new area from
the existing flat Money/Health/Relation/Mind checklist (habits /
habit_completions), not a change to it. See database.models.MorningRitual
for the full field-by-field rationale.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c8574ed82d2'
down_revision: Union[str, Sequence[str], None] = 'c4e1f7a2b8d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'morning_rituals',
        sa.Column('day', sa.String(), nullable=False),
        sa.Column('step', sa.Integer(), nullable=False),
        sa.Column('wake_done', sa.Boolean(), nullable=False),
        sa.Column('energy', sa.Integer(), nullable=True),
        sa.Column('mood', sa.Integer(), nullable=True),
        sa.Column('journal_feeling', sa.String(), nullable=False),
        sa.Column('journal_priority', sa.String(), nullable=False),
        sa.Column('meditation_target_secs', sa.Integer(), nullable=False),
        sa.Column('meditation_done_secs', sa.Float(), nullable=False),
        sa.Column('intention', sa.String(), nullable=False),
        sa.Column('preview_seen', sa.Boolean(), nullable=False),
        sa.Column('completed', sa.Boolean(), nullable=False),
        sa.Column('started_at', sa.Float(), nullable=True),
        sa.Column('completed_at', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('day'),
    )


def downgrade() -> None:
    op.drop_table('morning_rituals')
