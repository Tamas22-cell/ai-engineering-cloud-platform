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
