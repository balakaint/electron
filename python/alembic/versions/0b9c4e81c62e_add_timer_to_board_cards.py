"""add timer (secs/sessions) to board_cards

Revision ID: 0b9c4e81c62e
Revises: b81a2c8dad9b

A real start/stop timer on a board card (2026-09-16, Zahid: the
standalone `ele kanban` pilot's old header countdown was cosmetic —
"never tied to anything real" — and he asked for the Individual Task
Board's own FOCUS-column cards to get a genuine one instead). Same
shape as Task.secs/Task.sessions, reused via
engine.timer_reconciliation rather than reinvented — see
database/models.py's BoardCard docstring. Additive only, matching this
codebase's own convention for a plain column add.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0b9c4e81c62e'
down_revision: Union[str, Sequence[str], None] = 'b81a2c8dad9b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('board_cards', schema=None) as batch_op:
        batch_op.add_column(sa.Column('secs', sa.Float(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('sessions', sa.JSON(), nullable=False, server_default='[]'))


def downgrade() -> None:
    with op.batch_alter_table('board_cards', schema=None) as batch_op:
        batch_op.drop_column('sessions')
        batch_op.drop_column('secs')
