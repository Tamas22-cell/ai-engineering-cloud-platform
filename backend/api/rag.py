from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
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
        result = await run_multi_agent_rag(
            db=db,
            user_id=str(user.id),
            question=data.question,
            top_k=data.top_k,
        )
        usage = result.get("usage") or {}
        if usage.get("model") and int(usage.get("total_tokens") or 0) > 0:
            try:
                await db.execute(text("""
                    INSERT INTO llm_usage_events
                        (id, user_id, provider, model, input_tokens, output_tokens, estimated_cost_usd, created_at)
                    VALUES
                        (:id, :user_id, 'openai', :model, :input_tokens, :output_tokens, :cost, :created_at)
                """), {
                    "id": str(uuid4()),
                    "user_id": str(user.id),
                    "model": str(usage["model"])[:120],
                    "input_tokens": int(usage.get("input_tokens") or 0),
                    "output_tokens": int(usage.get("output_tokens") or 0),
                    "cost": usage.get("estimated_cost_usd"),
                    "created_at": datetime.now(timezone.utc),
                })
                await db.commit()
            except Exception:
                await db.rollback()
                # Usage persistence is best-effort and must not discard a valid answer.
        return result
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Multi-agent RAG unavailable") from exc
