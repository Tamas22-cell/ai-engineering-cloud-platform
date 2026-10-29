"""Create document_chunks table.

Revision ID: b8e41d72c906
Revises: a7d26c90b135
"""

from alembic import op
import sqlalchemy as sa

revision = "b8e41d72c906"
down_revision = "a7d26c90b135"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "document_chunks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "document_id",
            sa.String(36),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("chunk_number", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("embedding", sa.JSON(), nullable=False),
        sa.UniqueConstraint(
            "document_id",
            "page",
            "chunk_number",
            name="uq_document_chunk_position",
        ),
    )

    op.create_index(
        "ix_document_chunks_document_id",
        "document_chunks",
        ["document_id"],
    )


def downgrade():
    op.drop_index(
        "ix_document_chunks_document_id",
        table_name="document_chunks",
    )
    op.drop_table("document_chunks")
