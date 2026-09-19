"""add goal_id to board_cards (Goal's "-> BOARD" button)

Revision ID: 48d822248fb2
Revises: 8fc17660c486
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '48d822248fb2'
down_revision: str | None = '8fc17660c486'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ondelete='SET NULL': proven necessary by a failed test run, not
    # assumed — connection.py turns PRAGMA foreign_keys ON for every
    # connection, so a plain FK with no ondelete clause makes SQLite
    # RESTRICT the delete (IntegrityError) the moment a goal with a
    # linked card is removed. SET NULL is what "the card survives, only
    # the backlink is lost" actually requires at the database level.
    with op.batch_alter_table('board_cards', schema=None) as batch_op:
        batch_op.add_column(sa.Column('goal_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_board_cards_goal', 'goals', ['goal_id'], ['id'], ondelete='SET NULL'
        )


def downgrade() -> None:
    with op.batch_alter_table('board_cards', schema=None) as batch_op:
        batch_op.drop_constraint('fk_board_cards_goal', type_='foreignkey')
        batch_op.drop_column('goal_id')
