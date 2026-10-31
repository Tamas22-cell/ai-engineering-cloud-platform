"""Add pgvector cosine search while retaining JSON embeddings for compatibility.

Revision ID: c32e71a9d404
Revises: a42d829cab10
"""
from alembic import op

revision = "c32e71a9d404"
down_revision = "a42d829cab10"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("ALTER TABLE document_chunks ADD COLUMN embedding_vector vector(1536)")
    # Existing JSON embeddings remain intact. Only correctly-sized vectors are migrated.
    op.execute("""
        UPDATE document_chunks
        SET embedding_vector = (embedding::text)::vector(1536)
        WHERE json_array_length(embedding::json) = 1536
    """)
    op.execute("""
        CREATE INDEX ix_document_chunks_embedding_vector_hnsw
        ON document_chunks USING hnsw (embedding_vector vector_cosine_ops)
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_vector_hnsw")
    op.execute("ALTER TABLE document_chunks DROP COLUMN embedding_vector")
