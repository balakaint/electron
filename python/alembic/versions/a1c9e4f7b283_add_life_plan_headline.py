"""add life_plan_headline to app_state

Revision ID: a1c9e4f7b283
Revises: 4f3e39858a82

New in this port, no legacy equivalent — a single free-text headline
shown in panel 2 instead of any one project's goals when every project
in panel 1 is collapsed (see ProjectDashboard's onAllCollapsedChange
and App.tsx's LifePlanPanel). Additive only, nullable, no data to
migrate.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c9e4f7b283'
down_revision: Union[str, Sequence[str], None] = '4f3e39858a82'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('app_state', schema=None) as batch_op:
        batch_op.add_column(sa.Column('life_plan_headline', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('app_state', schema=None) as batch_op:
        batch_op.drop_column('life_plan_headline')
