from sqlalchemy import delete, select, text
import json
from sqlalchemy.ext.asyncio import AsyncSession

from models.document import Document
from models.document_chunk import DocumentChunk


async def save_document_chunks(
    db: AsyncSession,
    user_id: str,
    document_id: str,
    chunks: list[dict],
    embeddings: list[list[float]],
) -> int:
    """Replace chunks only for a document owned by the user."""

    if len(chunks) != len(embeddings):
        raise ValueError("Chunk and embedding counts must match")

    result = await db.execute(
        select(Document.id).where(
            Document.id == document_id,
            Document.user_id == user_id,
        )
    )

    if result.scalar_one_or_none() is None:
        raise ValueError("Document not found")

    try:
        await db.execute(
            delete(DocumentChunk).where(
                DocumentChunk.document_id == document_id
            )
        )

        for chunk, embedding in zip(chunks, embeddings):
            db.add(
                DocumentChunk(
                    document_id=document_id,
                    page=chunk["page"],
                    chunk_number=chunk["chunk"],
                    text=chunk["text"],
                    embedding=embedding,
                )
            )

        # Keep the existing JSON representation for backwards compatibility.
        # On PostgreSQL, also populate the indexed native vector column.
        if db.get_bind().dialect.name == 'postgresql':
            await db.flush()
            for chunk, embedding in zip(chunks, embeddings):
                if len(embedding) != 1536:
                    raise ValueError('Expected 1536-dimensional OpenAI embedding')
                await db.execute(text('''
                    UPDATE document_chunks
                    SET embedding_vector = CAST(:vector AS vector(1536))
                    WHERE document_id = :document_id
                      AND page = :page AND chunk_number = :chunk_number
                '''), {
                    'vector': json.dumps(embedding),
                    'document_id': document_id,
                    'page': chunk['page'],
                    'chunk_number': chunk['chunk'],
                })
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return len(chunks)
