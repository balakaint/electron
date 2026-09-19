"""112-day transformation board v2 — quarterly_answers rewrite

Revision ID: 4f3e39858a82
Revises: 0b9c4e81c62e

Zahid's detailed spec for turning the 90/112-day Quarterly Plan from a
simple 3-field form (Outcome / weekly Action / If-then) into a 7-step
"WHERE AM I -> WHERE AM I GOING -> GAP -> MAJOR CHANGES -> WEEKLY LEAD
BEHAVIOR -> IF/THEN -> REVIEW/RECALIBRATE" board. Additive only — adds
9 new columns to quarterly_answers and copies each old field's content
forward into its replacement (out -> destination, act ->
weekly_lead_behavior, ifthen -> response_then) so nothing existing is
lost. The old out/act/ifthen columns are kept, unused, same convention
as every other superseded-but-not-dropped column in this app — see
QuarterlyAnswer's own docstring in database/models.py.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4f3e39858a82'
down_revision: Union[str, Sequence[str], None] = '0b9c4e81c62e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('quarterly_answers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('current_reality', sa.String(), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('destination', sa.String(), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('proof', sa.String(), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('achieved', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('gap', sa.String(), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('major_changes', sa.JSON(), nullable=False, server_default='[]'))
        batch_op.add_column(sa.Column('weekly_lead_behavior', sa.String(), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('obstacle_if', sa.String(), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('response_then', sa.String(), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('goal_version', sa.Integer(), nullable=False, server_default='1'))
        batch_op.add_column(sa.Column('goal_history', sa.JSON(), nullable=False, server_default='[]'))

    # One-time forward copy of existing content — see this migration's
    # own docstring. Only copies where the old field actually has text,
    # so a fresh row's server_default '' isn't overwritten with another
    # ''  (harmless either way, just avoids a no-op UPDATE on every row).
    op.execute("UPDATE quarterly_answers SET destination = out WHERE out != ''")
    op.execute("UPDATE quarterly_answers SET weekly_lead_behavior = act WHERE act != ''")
    op.execute("UPDATE quarterly_answers SET response_then = ifthen WHERE ifthen != ''")


def downgrade() -> None:
    with op.batch_alter_table('quarterly_answers', schema=None) as batch_op:
        batch_op.drop_column('goal_history')
        batch_op.drop_column('goal_version')
        batch_op.drop_column('response_then')
        batch_op.drop_column('obstacle_if')
        batch_op.drop_column('weekly_lead_behavior')
        batch_op.drop_column('major_changes')
        batch_op.drop_column('gap')
        batch_op.drop_column('achieved')
        batch_op.drop_column('proof')
        batch_op.drop_column('destination')
        batch_op.drop_column('current_reality')
