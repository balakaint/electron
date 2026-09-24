"""health edits: overrides, diet, dislikes

Revision ID: c9e1f3a7b524
Revises: b5d2e8a4c137
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'c9e1f3a7b524'
down_revision: str | None = 'b5d2e8a4c137'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('health_profile', sa.Column('diet', sa.JSON(), nullable=False, server_default='[]'))
    op.add_column('health_profile', sa.Column('dislikes', sa.JSON(), nullable=False, server_default='[]'))
    op.create_table(
        'health_override',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('scope', sa.String(), nullable=False),
        sa.Column('idx', sa.Integer(), nullable=False),
        sa.Column('data', sa.JSON(), nullable=False, server_default='[]'),
        sa.UniqueConstraint('kind', 'scope', 'idx', name='uq_health_override'),
    )


def downgrade() -> None:
    op.drop_table('health_override')
    with op.batch_alter_table('health_profile') as batch:
        batch.drop_column('dislikes')
        batch.drop_column('diet')
