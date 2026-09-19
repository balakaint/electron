"""add feelings/thoughts/beliefs/actions to business_analysis

Revision ID: b81a2c8dad9b
Revises: 900eb301a04b

The DECISION section's redesign (Zahid, 2026-09-15): the GO/VALIDATE/
PIVOT/NO-GO chip row + "why this decision?" + change history was
replaced on the canvas by four Feelings/Thoughts/Beliefs/Actions
blocks, each pairing the current negative state linked to the goal with
the positive state needed to succeed — 8 new text columns. `decision_why`/
`decision_status` and the `decision_log` table are deliberately left in
place, just unused by the canvas now — see database/models.py's
BusinessAnalysis docstring.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b81a2c8dad9b'
down_revision: Union[str, Sequence[str], None] = '900eb301a04b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = [
    'feelings_negative', 'feelings_positive',
    'thoughts_negative', 'thoughts_positive',
    'beliefs_negative', 'beliefs_positive',
    'actions_negative', 'actions_positive',
]


def upgrade() -> None:
    with op.batch_alter_table('business_analysis', schema=None) as batch_op:
        for col in _COLUMNS:
            batch_op.add_column(sa.Column(col, sa.String(), nullable=False, server_default=''))


def downgrade() -> None:
    with op.batch_alter_table('business_analysis', schema=None) as batch_op:
        for col in _COLUMNS:
            batch_op.drop_column(col)
