"""journey vision fields (why, vision, target date, pins, last move)

Revision ID: a3c8e51f7d20
Revises: e7f2a4c9b615
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'a3c8e51f7d20'
down_revision: str | None = 'e7f2a4c9b615'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TEXT = ('why', 'vision', 'vision_note', 'target_date', 'last_move')


def upgrade() -> None:
    for name in _TEXT:
        op.add_column('project_journey', sa.Column(name, sa.String(), nullable=False, server_default=''))
    op.add_column('project_journey', sa.Column('pins', sa.JSON(), nullable=False, server_default='[]'))


def downgrade() -> None:
    with op.batch_alter_table('project_journey') as batch:
        batch.drop_column('pins')
        for name in reversed(_TEXT):
            batch.drop_column(name)
