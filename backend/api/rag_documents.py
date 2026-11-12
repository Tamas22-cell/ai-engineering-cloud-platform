from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from rag.document_repository import list_user_documents

router = APIRouter(prefix="/rag", tags=["RAG"])


@router.get("/documents")
async def get_documents(
    limit: int = Query(default=50, ge=1, le=100),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    documents = await list_user_documents(
        db=db,
        user_id=str(user.id),
        limit=limit,
    )

    return {
        "documents": [
            {
                "id": doc.id,
                "filename": doc.filename,
                "file_size": doc.file_size,
                "created_at": doc.created_at,
            }
            for doc in documents
        ],
        "count": len(documents),
    }


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete only the authenticated user's document and its indexed chunks."""
    from fastapi import HTTPException
    from sqlalchemy import delete, select
    from models.document import Document
    from models.document_chunk import DocumentChunk

    document = (await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == str(user.id))
    )).scalar_one_or_none()
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
    await db.execute(delete(Document).where(Document.id == document_id, Document.user_id == str(user.id)))
    await db.commit()
