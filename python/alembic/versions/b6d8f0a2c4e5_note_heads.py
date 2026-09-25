"""note heads (user-made NOTES headings) + notes.head_id

Revision ID: b6d8f0a2c4e5
Revises: a5c7e9f1b3d4
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'b6d8f0a2c4e5'
down_revision: str | None = 'a5c7e9f1b3d4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'note_heads',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
    )
    op.add_column('notes', sa.Column('head_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('notes') as batch:
        batch.drop_column('head_id')
    op.drop_table('note_heads')
