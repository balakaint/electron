"""merge heads

Revision ID: 56bccc7a6e81
Revises: a1c9e4f7b283, d3a9f5c1e824
Create Date: 2026-09-17 20:01:37.543475

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '56bccc7a6e81'
down_revision: Union[str, Sequence[str], None] = ('a1c9e4f7b283', 'd3a9f5c1e824')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
