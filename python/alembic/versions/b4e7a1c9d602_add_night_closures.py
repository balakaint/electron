"""add night_closures

Revision ID: b4e7a1c9d602
Revises: 7a2d4f9c1b56

New table for the "Night Closure" evening feature — see
database/models.py's NightClosure docstring. Feeds MorningRitual's
existing `carried_from_date` column, which has been real schema with
no writer until this migration.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4e7a1c9d602'
down_revision: Union[str, Sequence[str], None] = '7a2d4f9c1b56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'night_closures',
        sa.Column('day', sa.String(), nullable=False),
        sa.Column('where_stopped', sa.String(), nullable=False),
        sa.Column('unfinished', sa.String(), nullable=False),
        sa.Column('tomorrow_outcome', sa.String(), nullable=False),
        sa.Column('tomorrow_first_action', sa.String(), nullable=False),
        sa.Column('optional_blocker', sa.String(), nullable=False),
        sa.Column('optional_note', sa.String(), nullable=False),
        sa.Column('close_time', sa.String(), nullable=True),
        sa.Column('closed_at', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('day'),
    )


def downgrade() -> None:
    op.drop_table('night_closures')
