from sqlalchemy import delete, select
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

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return len(chunks)
