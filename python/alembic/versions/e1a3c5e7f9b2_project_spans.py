"""project_spans: when in the day project time was worked

Revision ID: e1a3c5e7f9b2
Revises: d8f0b2c4e6a7

ProjectActivity keeps a per-day total only; PLAN's deep work curve needs
the real start and end of each credited stretch. Starts empty — the
curve can only draw days from this migration on.
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'e1a3c5e7f9b2'
down_revision: str | None = 'd8f0b2c4e6a7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'project_spans',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_key', sa.String(), sa.ForeignKey('projects.key'), nullable=False),
        sa.Column('start', sa.Float(), nullable=False),
        sa.Column('end', sa.Float(), nullable=False),
    )
    op.create_index('ix_project_spans_project_key', 'project_spans', ['project_key'])
    op.create_index('ix_project_spans_start', 'project_spans', ['start'])


def downgrade() -> None:
    op.drop_index('ix_project_spans_start', table_name='project_spans')
    op.drop_index('ix_project_spans_project_key', table_name='project_spans')
    op.drop_table('project_spans')
