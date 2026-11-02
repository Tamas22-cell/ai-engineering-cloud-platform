"""Add structured MLOps experiment tracking without changing legacy model runs.

Revision ID: e91b7c4a620f
Revises: c32e71a9d404
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "e91b7c4a620f"
down_revision = "c32e71a9d404"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ml_experiments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("model_id", sa.String(36), sa.ForeignKey("registered_models.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("model_id", "name", name="uq_ml_experiment_model_name"),
    )
    op.create_index("ix_ml_experiments_model_id", "ml_experiments", ["model_id"])

    op.create_table(
        "ml_experiment_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("experiment_id", sa.String(36), sa.ForeignKey("ml_experiments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("hyperparameters", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("dataset_version", sa.String(160), nullable=True),
        sa.Column("git_commit_sha", sa.String(40), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('pending', 'running', 'completed', 'failed', 'cancelled')", name="ck_ml_experiment_run_status"),
    )
    op.create_index("ix_ml_experiment_runs_experiment_id", "ml_experiment_runs", ["experiment_id"])

    op.create_table(
        "ml_experiment_metrics",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("ml_experiment_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("step", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("step >= 0", name="ck_ml_experiment_metric_step"),
    )
    op.create_index("ix_ml_experiment_metrics_run_id", "ml_experiment_metrics", ["run_id"])


def downgrade():
    op.drop_index("ix_ml_experiment_metrics_run_id", table_name="ml_experiment_metrics")
    op.drop_table("ml_experiment_metrics")
    op.drop_index("ix_ml_experiment_runs_experiment_id", table_name="ml_experiment_runs")
    op.drop_table("ml_experiment_runs")
    op.drop_index("ix_ml_experiments_model_id", table_name="ml_experiments")
    op.drop_table("ml_experiments")
