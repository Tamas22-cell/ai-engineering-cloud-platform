from datetime import datetime, timedelta, timezone
from decimal import Decimal
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user

router = APIRouter(prefix="/finops", tags=["FinOps"])


@router.get("/status")
async def get_finops_status():
    """Expose non-sensitive configuration status so the UI can explain coverage before sign-in."""
    pricing_configured = bool(
        os.getenv("OPENAI_INPUT_USD_PER_1M")
        and os.getenv("OPENAI_OUTPUT_USD_PER_1M")
    )
    return {
        "pricing_configured": pricing_configured,
        "pricing_model": "gpt-4.1-mini",
        "provider_billing_connected": False,
    }


@router.get("/usage")
async def get_usage(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Return the authenticated user's measured RAG completion usage for 30 days."""
    since = datetime.now(timezone.utc) - timedelta(days=30)
    try:
        summary = (await db.execute(text("""
            SELECT COUNT(*) AS requests,
                   COALESCE(SUM(input_tokens), 0) AS input_tokens,
                   COALESCE(SUM(output_tokens), 0) AS output_tokens,
                   COALESCE(SUM(estimated_cost_usd), 0) AS priced_cost_usd,
                   COUNT(estimated_cost_usd) AS priced_requests
            FROM llm_usage_events
            WHERE user_id = :user_id AND created_at >= :since
        """), {"user_id": str(user.id), "since": since})).mappings().one()
        daily = (await db.execute(text("""
            SELECT CAST(created_at AT TIME ZONE 'UTC' AS DATE) AS day,
                   COUNT(*) AS requests,
                   COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
                   COALESCE(SUM(estimated_cost_usd), 0) AS priced_cost_usd,
                   COUNT(estimated_cost_usd) AS priced_requests
            FROM llm_usage_events
            WHERE user_id = :user_id AND created_at >= :since
            GROUP BY CAST(created_at AT TIME ZONE 'UTC' AS DATE)
            ORDER BY day DESC
        """), {"user_id": str(user.id), "since": since})).mappings().all()
        return {
            "window_days": 30,
            "source": "measured_rag_completion_usage",
            "requests": int(summary["requests"]),
            "input_tokens": int(summary["input_tokens"]),
            "output_tokens": int(summary["output_tokens"]),
            "total_tokens": int(summary["input_tokens"] + summary["output_tokens"]),
            "priced_requests": int(summary["priced_requests"]),
            "estimated_cost_usd": str(Decimal(summary["priced_cost_usd"])),
            "daily": [{
                "date": row["day"].isoformat(),
                "requests": int(row["requests"]),
                "tokens": int(row["tokens"]),
                "priced_requests": int(row["priced_requests"]),
                "estimated_cost_usd": str(Decimal(row["priced_cost_usd"])),
            } for row in daily],
            "note": "Measured single-agent and multi-agent RAG answer-generation tokens only. Embeddings and cloud-provider billing are excluded. Cost is an estimate and is omitted when token rates are not configured.",
        }
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=503, detail="FinOps usage data unavailable") from exc
