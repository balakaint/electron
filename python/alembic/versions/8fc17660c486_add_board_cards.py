"""add board_cards (per-project Focus Board kanban)

Revision ID: 8fc17660c486
Revises: c1f47a9b06de
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '8fc17660c486'
down_revision: str | None = 'c1f47a9b06de'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'board_cards',
        sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('project_key', sa.String(), nullable=False),
        sa.Column('col', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('note', sa.String(), nullable=False),
        sa.Column('priority', sa.String(), nullable=False),
        sa.Column('pinned', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['project_key'], ['projects.key']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('board_cards')
