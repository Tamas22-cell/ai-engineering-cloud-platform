from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from rag.persistent_indexer import index_stored_pdf

router = APIRouter(prefix="/rag", tags=["RAG"])


@router.post("/index/{document_id}")
async def index_document(
    document_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        count = await index_stored_pdf(
            db=db,
            user_id=str(user.id),
            document_id=document_id,
        )
    except ValueError as exc:
        if str(exc) == "Document not found":
            raise HTTPException(
                status_code=404,
                detail="Document not found",
            ) from exc
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Document indexing unavailable",
        ) from exc

    return {
        "document_id": document_id,
        "chunks_indexed": count,
        "status": "indexed",
    }
