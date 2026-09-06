"""add attach_path to business_analysis

Revision ID: 5d50bc296e19
Revises: 24af89c04375
Create Date: 2026-09-06 23:02:09.419002

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5d50bc296e19'
down_revision: Union[str, Sequence[str], None] = '24af89c04375'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("business_analysis", sa.Column("attach_path", sa.String(), nullable=False, server_default=""))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("business_analysis", "attach_path")
