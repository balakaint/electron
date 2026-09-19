"""drop project_key FK from goals for the Life virtual project-owner

Revision ID: 26f6de8766a5
Revises: 56bccc7a6e81
Create Date: 2026-09-17 20:23:14.876935

The "Life Plan" feature (originally a standalone life_plan_headline field
on app_state, see the now-removed set_life_plan_headline/LifePlanPanel)
was corrected: "Life" is its own virtual project that owns weekly/monthly/
yearly goals exactly like a real project, reusing the Goal table and
GoalsPanel component verbatim with project_key="life" — not a separate
screen. There is deliberately no "life" row in `projects`: a real row
would show up in panel 1's fixed 6-slot roster, today's total/trend/streak
sums (ProjectRepository.list() / named_projects() have no "not a real
project" filter to exclude it), which is a much bigger blast radius than
this feature needs. Dropping the FK is what makes that possible — with
connection.py's PRAGMA foreign_keys=ON, project_key="life" would
otherwise fail every insert. GoalEngine never looked the project up in
the first place (no code changes there), so the FK was the only actual
gate; api/schemas.py's GoalOwnerKeyT now does that job at the API
boundary instead.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '26f6de8766a5'
down_revision: Union[str, Sequence[str], None] = '56bccc7a6e81'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The original `sa.ForeignKeyConstraint(['project_key'], ['projects.key'])`
    # (migration 6cf6bdf5f418) was never given an explicit name, and
    # SQLite has no ALTER TABLE DROP CONSTRAINT at all — batch mode is
    # the only way, and an unnamed constraint needs a naming_convention
    # supplied here so drop_constraint has something to target. This is
    # Alembic's own documented recipe for exactly this situation.
    with op.batch_alter_table(
        "goals",
        schema=None,
        naming_convention={"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"},
    ) as batch_op:
        batch_op.drop_constraint("fk_goals_project_key_projects", type_="foreignkey")


def downgrade() -> None:
    with op.batch_alter_table("goals", schema=None) as batch_op:
        batch_op.create_foreign_key(
            "fk_goals_project_key_projects", "projects", ["project_key"], ["key"]
        )
