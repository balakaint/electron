"""add business plan notes (bdp)

Revision ID: c9ce19d69cbf
Revises: 42f57a56ea0d
Create Date: 2026-09-06 17:00:00.000000

"""
import time
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9ce19d69cbf'
down_revision: Union[str, Sequence[str], None] = '42f57a56ea0d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


bdp_plans = sa.table(
    "bdp_plans",
    sa.column("id", sa.Integer),
    sa.column("title", sa.String),
    sa.column("status", sa.String),
    sa.column("priority", sa.String),
    sa.column("opportunity", sa.String),
    sa.column("market", sa.String),
    sa.column("target", sa.String),
    sa.column("niche", sa.String),
    sa.column("model", sa.String),
    sa.column("product", sa.String),
    sa.column("service", sa.String),
    sa.column("supplier", sa.String),
    sa.column("timeline", sa.String),
    sa.column("potential", sa.Integer),
    sa.column("difficulty", sa.Integer),
    sa.column("cost_amount", sa.String),
    sa.column("yearly_profit", sa.String),
    sa.column("notes", sa.String),
    sa.column("archived", sa.Boolean),
    sa.column("created", sa.String),
    sa.column("updated", sa.String),
    sa.column("order", sa.Float),
)

bdp_actions = sa.table(
    "bdp_actions",
    sa.column("id", sa.Integer),
    sa.column("plan_id", sa.Integer),
    sa.column("text", sa.String),
    sa.column("done", sa.Boolean),
    sa.column("sort_order", sa.Integer),
)

# Matches _bdp_seed's six starter opportunities exactly (title, status,
# opportunity, actions, timeline, priority, market) — the "investment"
# int rating _bdp_seed also set is dropped, see BdpPlan's docstring: no
# UI in either legacy or the port ever reads/writes that field, only
# Potential/Difficulty are real rating controls.
_SEED = [
    ("SUPPLEMENT BUSINESS", "IDEA",
     "High demand for natural skincare and wellness products in Asian and Middle Eastern markets.",
     ["Product research", "Supplier research", "Competitor analysis", "Market validation"],
     "3 Months", "HIGH", "Global"),
    ("AMAZON FBA BUSINESS", "OPPORTUNITY",
     "Find products with stable demand, manageable competition and healthy margins.",
     ["Product research", "Competitor analysis", "Sample testing", "Amazon listing"],
     "4 Months", "HIGH", "USA"),
    ("LAPTOP WORKSTATION IMPORT", "PLAN",
     "Growing demand for high-performance workstations among designers, engineers and IT professionals.",
     ["Supplier selection", "Model selection", "Import costing", "Local marketing"],
     "2 Months", "MEDIUM", "Bangladesh"),
    ("DIGITAL MARKETING AGENCY", "IDEA",
     "Small businesses need affordable digital marketing and online growth support.",
     ["Define service packages", "Build skills/team", "Acquire first clients", "Create recurring revenue"],
     "3 Months", "MEDIUM", "Local + Global"),
    ("PRINT ON DEMAND STORE", "PLAN",
     "Low-inventory e-commerce model using personalized and trend-based products.",
     ["Niche research", "Product research", "Shopify setup", "Marketing"],
     "2 Months", "MEDIUM", "Global"),
    ("EXPORT BUSINESS", "OPPORTUNITY",
     "Bangladeshi food products may have export potential through competitive pricing and differentiated products.",
     ["Buyer research", "Sample preparation", "Compliance documentation", "Shipment"],
     "4 Months", "HIGH", "USA"),
]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "bdp_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="IDEA"),
        sa.Column("priority", sa.String(), nullable=False, server_default="MEDIUM"),
        sa.Column("opportunity", sa.String(), nullable=False, server_default=""),
        sa.Column("market", sa.String(), nullable=False, server_default=""),
        sa.Column("target", sa.String(), nullable=False, server_default=""),
        sa.Column("niche", sa.String(), nullable=False, server_default=""),
        sa.Column("model", sa.String(), nullable=False, server_default=""),
        sa.Column("product", sa.String(), nullable=False, server_default=""),
        sa.Column("service", sa.String(), nullable=False, server_default=""),
        sa.Column("supplier", sa.String(), nullable=False, server_default=""),
        sa.Column("timeline", sa.String(), nullable=False, server_default=""),
        sa.Column("potential", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("difficulty", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("cost_amount", sa.String(), nullable=False, server_default=""),
        sa.Column("yearly_profit", sa.String(), nullable=False, server_default=""),
        sa.Column("notes", sa.String(), nullable=False, server_default=""),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created", sa.String(), nullable=False, server_default=""),
        sa.Column("updated", sa.String(), nullable=False, server_default=""),
        sa.Column("order", sa.Float(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "bdp_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["plan_id"], ["bdp_plans.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("app_state", sa.Column("bdp_sort", sa.String(), nullable=False, server_default="manual"))

    # Seed the six starter opportunities — same "only on a genuinely
    # empty table" intent as _bdp_seed, guaranteed here since this
    # migration runs exactly once, ever, on a fresh database (unlike
    # legacy's lazy-check-on-every-load, which needed a flag because it
    # ran on every app open).
    base_id = int(time.time() * 1000)
    conn = op.get_bind()
    action_id = base_id + 1000
    for i, (title, status, opportunity, actions, timeline, priority, market) in enumerate(_SEED):
        plan_id = base_id + i
        conn.execute(
            bdp_plans.insert().values(
                id=plan_id, title=title, status=status, priority=priority,
                opportunity=opportunity, market=market, target="", niche="",
                model="", product="", service="", supplier="", timeline=timeline,
                potential=4 if priority == "HIGH" else 3, difficulty=3,
                cost_amount="", yearly_profit="", notes="", archived=False,
                created="", updated="", order=float(i),
            )
        )
        for j, action_text in enumerate(actions):
            conn.execute(
                bdp_actions.insert().values(
                    id=action_id, plan_id=plan_id, text=action_text, done=False, sort_order=j
                )
            )
            action_id += 1


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("app_state", "bdp_sort")
    op.drop_table("bdp_actions")
    op.drop_table("bdp_plans")
