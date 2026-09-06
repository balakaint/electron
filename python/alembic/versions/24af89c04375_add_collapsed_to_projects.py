"""add collapsed to projects

Revision ID: 24af89c04375
Revises: af363c168965
Create Date: 2026-09-06 22:46:12.382593

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '24af89c04375'
down_revision: Union[str, Sequence[str], None] = 'af363c168965'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("projects", sa.Column("collapsed", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("projects", "collapsed")
