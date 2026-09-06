"""add sort_order to tasks

Revision ID: c6586ce94651
Revises: 198db9e036c1
Create Date: 2026-09-06 21:18:06.589282

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c6586ce94651'
down_revision: Union[str, Sequence[str], None] = '198db9e036c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("tasks", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))

    # Backfill so existing tasks keep their current display order (by id,
    # which is a creation-time ms-timestamp) instead of all collapsing to
    # sort_order=0 and re-shuffling on the very first render.
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, list_key FROM tasks ORDER BY list_key, id")).fetchall()
    counters: dict[str, int] = {}
    for task_id, list_key in rows:
        n = counters.get(list_key, 0)
        conn.execute(sa.text("UPDATE tasks SET sort_order = :n WHERE id = :id"), {"n": n, "id": task_id})
        counters[list_key] = n + 1


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("tasks", "sort_order")
