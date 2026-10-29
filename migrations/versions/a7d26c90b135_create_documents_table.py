"""Create documents table.

Revision ID: a7d26c90b135
Revises: 684e2827a263
"""

from alembic import op
import sqlalchemy as sa

revision = "a7d26c90b135"
down_revision = "684e2827a263"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("file_data", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_documents_user_id",
        "documents",
        ["user_id"],
    )


def downgrade():
    op.drop_index("ix_documents_user_id", table_name="documents")
    op.drop_table("documents")
