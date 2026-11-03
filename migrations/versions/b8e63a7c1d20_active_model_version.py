"""Add active model version pointer per experiment.

Revision ID: b8e63a7c1d20
Revises: e91b7c4a620f
"""
from alembic import op
import sqlalchemy as sa

revision = "b8e63a7c1d20"
down_revision = "e91b7c4a620f"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "ml_active_model_versions",
        sa.Column("experiment_id", sa.String(36), sa.ForeignKey("ml_experiments.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("ml_experiment_runs.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("activated_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

def downgrade():
    op.drop_table("ml_active_model_versions")
