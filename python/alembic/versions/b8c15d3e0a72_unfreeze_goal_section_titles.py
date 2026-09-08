"""clear goal section titles that only ever held a default

Revision ID: b8c15d3e0a72
Revises: a4d8e02f9c17

The goal panel's section headings are editable, and a custom title is
stored per horizon; the UI falls back to a built-in default when the
stored value is NULL.

The heading input persisted on every blur, without comparing to what was
already there, so clicking into a heading and clicking out again wrote
the DEFAULT into the database as though the user had typed it. From then
on that section had a "custom" title and could never follow the default
again — which surfaced when the defaults changed to WEEKLY / MONTHLY /
YEARLY and one section kept saying "MID TERM GOAL".

The blur is fixed in the renderer. This clears the values it froze in.
Only the three exact legacy defaults are cleared: anything else is a
title someone actually chose. A user who deliberately typed "MID TERM
GOAL" loses a title identical to the one they will now see by default.
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'b8c15d3e0a72'
down_revision: str | None = 'a4d8e02f9c17'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FROZEN_DEFAULTS = ('SHORT TERM GOAL', 'MID TERM GOAL', 'LONG TERM GOAL')


def upgrade() -> None:
    for col in ('sec_title_yearly', 'sec_title_monthly', 'sec_title_weekly'):
        op.execute(
            sa.text(f"UPDATE app_state SET {col} = NULL WHERE {col} IN :d").bindparams(
                sa.bindparam('d', value=_FROZEN_DEFAULTS, expanding=True)
            )
        )


def downgrade() -> None:
    # Nothing to restore: the cleared values were defaults, and the
    # default is what the UI shows for NULL.
    pass
