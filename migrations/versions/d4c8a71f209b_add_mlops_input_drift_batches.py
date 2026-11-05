"""Store aggregate inference inputs for privacy-preserving drift monitoring."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d4c8a71f209b"
down_revision: Union[str, None] = "b7a1c93e4d20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mlops_input_drift_batches",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("run_id", sa.String(length=36), sa.ForeignKey("ml_experiment_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("input_mean", sa.Float(), nullable=False),
        sa.Column("input_std", sa.Float(), nullable=False),
        sa.Column("outlier_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_mlops_input_drift_run_created",
        "mlops_input_drift_batches",
        ["run_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_mlops_input_drift_run_created", table_name="mlops_input_drift_batches")
    op.drop_table("mlops_input_drift_batches")
