"""add mit prompt date to app_state

Revision ID: af363c168965
Revises: 4962110884dd
Create Date: 2026-09-06 22:14:42.284870

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'af363c168965'
down_revision: Union[str, Sequence[str], None] = '4962110884dd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("app_state", sa.Column("mit_prompt_date", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("app_state", "mit_prompt_date")
