"""Create MLOps model registry.

Revision ID: f5a93c208b11
Revises: b8e41d72c906
"""
from alembic import op
import sqlalchemy as sa

revision = "f5a93c208b11"
down_revision = "b8e41d72c906"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "registered_models",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("version", sa.String(80), nullable=False),
        sa.Column("framework", sa.String(60), nullable=False),
        sa.Column("stage", sa.String(20), nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("name", "version", name="uq_registered_model_version"),
    )
    op.create_index("ix_registered_models_name", "registered_models", ["name"])


def downgrade():
    op.drop_index("ix_registered_models_name", table_name="registered_models")
    op.drop_table("registered_models")
