import numpy as np
from sqlalchemy import select

from models.document import Document
from models.document_chunk import DocumentChunk


async def search_stored_documents(
    db,
    user_id: str,
    query_embedding: list[float],
    top_k: int = 5,
) -> list[dict]:
    """Search only document chunks owned by the user."""

    if not 1 <= top_k <= 20:
        raise ValueError("top_k must be between 1 and 20")

    query = np.asarray(query_embedding, dtype=float)

    if (
        query.ndim != 1
        or query.size == 0
        or not np.isfinite(query).all()
    ):
        raise ValueError("Invalid query embedding")

    query_norm = np.linalg.norm(query)

    if query_norm == 0:
        raise ValueError("Query embedding cannot be zero")

    statement = (
        select(DocumentChunk, Document.filename)
        .join(Document, DocumentChunk.document_id == Document.id)
        .where(Document.user_id == user_id)
    )

    result = await db.execute(statement)
    rows = result.all()

    matches = []

    for chunk, filename in rows:
        vector = np.asarray(chunk.embedding, dtype=float)

        if (
            vector.shape != query.shape
            or not np.isfinite(vector).all()
        ):
            continue

        norm = np.linalg.norm(vector)

        if norm == 0:
            continue

        score = float(
            np.dot(query, vector) / (query_norm * norm)
        )

        matches.append({
            "document_id": chunk.document_id,
            "source": filename,
            "page": chunk.page,
            "chunk": chunk.chunk_number,
            "text": chunk.text,
            "score": score,
        })

    matches.sort(key=lambda item: item["score"], reverse=True)

    return matches[:top_k]
