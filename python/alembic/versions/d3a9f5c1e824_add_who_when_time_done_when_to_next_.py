"""add who/when/time/done_when to business_analysis next action

Revision ID: d3a9f5c1e824
Revises: 4f3e39858a82

The NEXT ACTION card's visual redesign adds four properties of the
action itself — who's doing it, when, how long it should take, and what
"done" looks like — alongside the existing next_action/next_priority/
next_deadline. Four new text columns, same pattern as next_deadline.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3a9f5c1e824'
down_revision: Union[str, Sequence[str], None] = '4f3e39858a82'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = ['next_who', 'next_when', 'next_time', 'next_done_when']


def upgrade() -> None:
    with op.batch_alter_table('business_analysis', schema=None) as batch_op:
        for col in _COLUMNS:
            batch_op.add_column(sa.Column(col, sa.String(), nullable=False, server_default=''))


def downgrade() -> None:
    with op.batch_alter_table('business_analysis', schema=None) as batch_op:
        for col in _COLUMNS:
            batch_op.drop_column(col)
