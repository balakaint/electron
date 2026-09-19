"""move sec_title_* from app_state to projects

Revision ID: d9c4b7a5e3f1
Revises: e3a7c15b9f04

Goals section headings (Weekly/Monthly/Yearly) were a single global
rename shared by every project — renaming one while looking at Project
A silently relabeled Project B's headings too. No real values are in
use yet (all three columns are still NULL on the only live app_state
row), so this drops them outright rather than migrating data, and adds
the same three columns to `projects` so each project keeps its own.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd9c4b7a5e3f1'
down_revision: Union[str, Sequence[str], None] = 'e3a7c15b9f04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('sec_title_yearly', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('sec_title_monthly', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('sec_title_weekly', sa.String(), nullable=True))
    with op.batch_alter_table('app_state') as batch_op:
        batch_op.drop_column('sec_title_yearly')
        batch_op.drop_column('sec_title_monthly')
        batch_op.drop_column('sec_title_weekly')


def downgrade() -> None:
    op.add_column('app_state', sa.Column('sec_title_yearly', sa.String(), nullable=True))
    op.add_column('app_state', sa.Column('sec_title_monthly', sa.String(), nullable=True))
    op.add_column('app_state', sa.Column('sec_title_weekly', sa.String(), nullable=True))
    with op.batch_alter_table('projects') as batch_op:
        batch_op.drop_column('sec_title_yearly')
        batch_op.drop_column('sec_title_monthly')
        batch_op.drop_column('sec_title_weekly')
