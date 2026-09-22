"""add goal_tasks, tasks.gsrc

Revision ID: b47e9f21c6a3
Revises: 7a2c4e9f8b31
Create Date: 2026-09-22 00:00:00.000000

A goal's own flat task checklist — mirrors project_subtasks (see
6c9a44157749) but scoped to goal_id (CASCADE, matching board_tasks)
instead of project_key. tasks.gsrc is the goal-task twin of tasks.psrc,
for "+ STRIKE" promoting a goal task into today's Focus list.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b47e9f21c6a3'
down_revision: Union[str, Sequence[str], None] = '7a2c4e9f8b31'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'goal_tasks',
        sa.Column('pid', sa.String(), nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.Column('text', sa.String(), nullable=False),
        sa.Column('done', sa.Boolean(), nullable=False),
        sa.Column('added_date', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['goal_id'], ['goals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('pid'),
    )
    # SQLite has no ALTER TABLE ADD CONSTRAINT — batch mode recreates the
    # table under the hood instead, matching how psrc's own FK was added.
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('gsrc', sa.String(), nullable=True))
        batch_op.create_foreign_key('fk_tasks_gsrc', 'goal_tasks', ['gsrc'], ['pid'])


def downgrade() -> None:
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_constraint('fk_tasks_gsrc', type_='foreignkey')
        batch_op.drop_column('gsrc')
    op.drop_table('goal_tasks')
