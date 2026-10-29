from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.dependencies import get_current_user
from rag.question_answering import RAGQuestionAnswering


router = APIRouter(prefix="/rag", tags=["RAG"])


class RAGAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    top_k: int = Field(default=5, ge=1, le=20)


@router.post("/ask")
async def ask_document(
    data: RAGAskRequest,
    user=Depends(get_current_user),
):
    try:
        qa = RAGQuestionAnswering()
        return await qa.ask(data.question, top_k=data.top_k)
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="RAG service unavailable",
        )
