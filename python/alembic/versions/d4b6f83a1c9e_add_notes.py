"""add notes

Revision ID: d4b6f83a1c9e
Revises: c9a1f4d872e6
Create Date: 2026-09-22 00:00:00.000000

Global quick-capture notes for EXECUTE's NOTES tab. See Note's own
docstring in database/models.py for why there's no title column and
only a soft-delete timestamp.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4b6f83a1c9e'
down_revision: Union[str, Sequence[str], None] = 'c9a1f4d872e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notes',
        sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('body', sa.String(), nullable=False),
        sa.Column('pinned', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.Float(), nullable=False),
        sa.Column('updated_at', sa.Float(), nullable=False),
        sa.Column('deleted_at', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('notes')
