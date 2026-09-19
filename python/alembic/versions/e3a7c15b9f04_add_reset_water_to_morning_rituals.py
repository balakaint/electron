"""add reset_water to morning_rituals

Revision ID: e3a7c15b9f04
Revises: b4e7a1c9d602

Morning Activation redesign to match Zahid's sample HTML 1:1 (Sep 19)
brings back the "Water" reset item the earlier rebuild dropped — see
database/models.py's MorningRitual.reset_water comment.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3a7c15b9f04'
down_revision: Union[str, Sequence[str], None] = 'b4e7a1c9d602'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'morning_rituals',
        sa.Column('reset_water', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('morning_rituals', 'reset_water')
