"""rebuild morning_rituals for the full Morning Activation brainstorm

Revision ID: 900eb301a04b
Revises: 01eb60eefc56

Drops and recreates `morning_rituals` with an entirely different column
set, replacing the original linear 7-step wizard (step/wake_done/
journal_feeling/journal_priority/meditation_*/intention/preview_seen)
with the fields Zahid's fuller "Morning Activation" brainstorm prototype
actually needs (SEE/CHECK-IN/RESET/CLEAR YOUR MIND/MORNING PRIME/START
NOW — see database/models.py's MorningRitual docstring for the full
reasoning and what's deliberately still deferred).

This is a DROP, not an ALTER — chosen because the table was created by
migration `7c8574ed82d2` less than 24 hours before this one, in this
same working session, so there is no realistic risk of destroying real
usage history, and Zahid's own instruction here was a "full rebuild,"
not an incremental migration of v1's shape. Any row that happened to
exist under the old shape is lost on upgrade; downgrade recreates the
OLD (v1, 7-step) table shape empty, matching migration
`7c8574ed82d2`'s original definition — it cannot recover new-shape data
either. Both directions are genuinely destructive of whatever shape
they're moving away from, which is acceptable here specifically because
of how new and unused this table was, not as a general pattern for
future changes to it.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '900eb301a04b'
down_revision: Union[str, Sequence[str], None] = '01eb60eefc56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('morning_rituals')
    op.create_table(
        'morning_rituals',
        sa.Column('day', sa.String(), nullable=False),
        sa.Column('today_outcome', sa.String(), nullable=False),
        sa.Column('first_move', sa.String(), nullable=False),
        sa.Column('carried_from_date', sa.String(), nullable=True),
        sa.Column('energy', sa.String(), nullable=True),
        sa.Column('mood', sa.String(), nullable=True),
        sa.Column('sleep_quality', sa.String(), nullable=True),
        sa.Column('morning_mode', sa.String(), nullable=False),
        sa.Column('reset_breathe', sa.Boolean(), nullable=False),
        sa.Column('reset_move', sa.Boolean(), nullable=False),
        sa.Column('reset_daylight', sa.Boolean(), nullable=False),
        sa.Column('journal_text', sa.String(), nullable=False),
        sa.Column('journal_action_needed', sa.Boolean(), nullable=True),
        sa.Column('journal_released', sa.Boolean(), nullable=False),
        sa.Column('prime_meditation', sa.Boolean(), nullable=False),
        sa.Column('prime_visualization', sa.Boolean(), nullable=False),
        sa.Column('prime_reading', sa.Boolean(), nullable=False),
        sa.Column('prime_gratitude', sa.String(), nullable=False),
        sa.Column('prime_intention', sa.String(), nullable=True),
        sa.Column('prime_spiritual', sa.String(), nullable=False),
        sa.Column('completed', sa.Boolean(), nullable=False),
        sa.Column('started_at', sa.Float(), nullable=True),
        sa.Column('started_first_action_at', sa.Float(), nullable=True),
        sa.Column('completed_at', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('day'),
    )


def downgrade() -> None:
    op.drop_table('morning_rituals')
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
