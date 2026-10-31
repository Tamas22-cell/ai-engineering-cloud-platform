from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from rag.persistent_qa import PersistentRAGQuestionAnswering
from rag.multi_agent import run_multi_agent_rag


router = APIRouter(prefix="/rag", tags=["RAG"])


class RAGAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    top_k: int = Field(default=5, ge=1, le=20)


@router.post("/ask")
async def ask_document(
    data: RAGAskRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        qa = PersistentRAGQuestionAnswering()

        return await qa.ask(
            db=db,
            user_id=str(user.id),
            question=data.question,
            top_k=data.top_k,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="RAG service unavailable",
        ) from exc


@router.post("/multi-agent/ask")
async def ask_multi_agent_document(
    data: RAGAskRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await run_multi_agent_rag(
            db=db,
            user_id=str(user.id),
            question=data.question,
            top_k=data.top_k,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Multi-agent RAG unavailable") from exc
