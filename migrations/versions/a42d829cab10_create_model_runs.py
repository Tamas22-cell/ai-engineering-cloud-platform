"""Create model run metrics.

Revision ID: a42d829cab10
Revises: f5a93c208b11
"""
from alembic import op
import sqlalchemy as sa

revision = "a42d829cab10"
down_revision = "f5a93c208b11"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "model_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("model_id", sa.String(36), sa.ForeignKey("registered_models.id", ondelete="CASCADE"), nullable=False),
        sa.Column("metric_name", sa.String(80), nullable=False),
        sa.Column("metric_value", sa.Float(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_model_runs_model_id", "model_runs", ["model_id"])


def downgrade():
    op.drop_index("ix_model_runs_model_id", table_name="model_runs")
    op.drop_table("model_runs")
