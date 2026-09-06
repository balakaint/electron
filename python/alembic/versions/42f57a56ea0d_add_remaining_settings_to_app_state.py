"""add remaining settings to app_state

Revision ID: 42f57a56ea0d
Revises: adba321546dd
Create Date: 2026-09-06 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '42f57a56ea0d'
down_revision: Union[str, Sequence[str], None] = 'adba321546dd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('app_state', sa.Column('lang', sa.String(), nullable=False, server_default='en'))
    op.add_column('app_state', sa.Column('analog_clock', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('app_state', sa.Column('auto_timer_on_open', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('app_state', sa.Column('idle_stop_min', sa.Integer(), nullable=False, server_default='15'))
    op.add_column('app_state', sa.Column('phase_morning_start', sa.Integer(), nullable=False, server_default='5'))
    op.add_column('app_state', sa.Column('phase_work_start', sa.Integer(), nullable=False, server_default='9'))
    op.add_column('app_state', sa.Column('phase_evening_start', sa.Integer(), nullable=False, server_default='18'))
    op.add_column('app_state', sa.Column('phase_sleep_start', sa.Integer(), nullable=False, server_default='23'))
    op.add_column('app_state', sa.Column('goal_hours', sa.Integer(), nullable=False, server_default='5'))
    op.add_column('app_state', sa.Column('currency', sa.String(), nullable=False, server_default='$'))
    op.add_column('app_state', sa.Column('start_with_windows', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('app_state', 'start_with_windows')
    op.drop_column('app_state', 'currency')
    op.drop_column('app_state', 'goal_hours')
    op.drop_column('app_state', 'phase_sleep_start')
    op.drop_column('app_state', 'phase_evening_start')
    op.drop_column('app_state', 'phase_work_start')
    op.drop_column('app_state', 'phase_morning_start')
    op.drop_column('app_state', 'idle_stop_min')
    op.drop_column('app_state', 'auto_timer_on_open')
    op.drop_column('app_state', 'analog_clock')
    op.drop_column('app_state', 'lang')
