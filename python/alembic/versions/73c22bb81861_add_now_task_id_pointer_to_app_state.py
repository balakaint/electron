"""add now_task_id pointer to app_state

Revision ID: 73c22bb81861
Revises: 6cf6bdf5f418
Create Date: 2026-09-06 00:16:06.864939

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '73c22bb81861'
down_revision: Union[str, Sequence[str], None] = '6cf6bdf5f418'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # SQLite can't ALTER a table to add a foreign key constraint —
    # needs batch mode's copy-and-move strategy instead (autogenerate's
    # plain add_column + create_foreign_key pair errors with
    # "No support for ALTER of constraints in SQLite dialect").
    with op.batch_alter_table('app_state', schema=None) as batch_op:
        batch_op.add_column(sa.Column('now_task_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_app_state_now_task_id_tasks', 'tasks', ['now_task_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('app_state', schema=None) as batch_op:
        batch_op.drop_constraint('fk_app_state_now_task_id_tasks', type_='foreignkey')
        batch_op.drop_column('now_task_id')
