from datetime import datetime, timedelta, timezone
from decimal import Decimal
import os
import json
from collections import defaultdict

import httpx

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
    vercel_billing_configured = bool(
        os.getenv("VERCEL_ACCESS_TOKEN") and os.getenv("VERCEL_TEAM_ID")
    )
    return {
        "pricing_configured": pricing_configured,
        "pricing_model": "gpt-4.1-mini",
        "vercel_billing_configured": vercel_billing_configured,
        "render_billing_connected": False,
    }


@router.get("/cloud-billing")
async def get_cloud_billing(user=Depends(get_current_user)):
    """Fetch the last 30 days of Vercel FOCUS charges for admins only."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    token = os.getenv("VERCEL_ACCESS_TOKEN")
    team_id = os.getenv("VERCEL_TEAM_ID")
    if not token or not team_id:
        raise HTTPException(status_code=503, detail="Vercel billing connection is not configured")

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=30)
    params = {
        "from": since.isoformat().replace("+00:00", "Z"),
        "to": now.isoformat().replace("+00:00", "Z"),
        "teamId": team_id,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                "https://api.vercel.com/v1/billing/charges",
                params=params,
                headers={"Authorization": f"Bearer {token}", "Accept-Encoding": "gzip"},
            )
            response.raise_for_status()
        totals = defaultdict(Decimal)
        daily = defaultdict(Decimal)
        services = defaultdict(Decimal)
        currencies = set()
        for line in response.text.splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            amount = Decimal(str(row.get("BilledCost") or "0"))
            currency = str(row.get("BillingCurrency") or "USD")
            day = str(row.get("ChargePeriodStart") or row.get("BillingPeriodStart") or "")[:10] or "unknown"
            service = str(row.get("ServiceName") or row.get("ServiceCategory") or "Other")[:100]
            totals[currency] += amount
            daily[(day, currency)] += amount
            services[(service, currency)] += amount
            currencies.add(currency)
        return {
            "provider": "vercel",
            "window_days": 30,
            "from": params["from"],
            "to": params["to"],
            "totals": [{"currency": currency, "billed_cost": str(totals[currency])} for currency in sorted(currencies)],
            "daily": [{"date": day, "currency": currency, "billed_cost": str(amount)} for (day, currency), amount in sorted(daily.items())],
            "services": [{"service": service, "currency": currency, "billed_cost": str(amount)} for (service, currency), amount in sorted(services.items())],
            "render_billing": "not_available_via_connected_api",
        }
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail="Vercel billing API rejected the configured token or team scope") from exc
    except (httpx.HTTPError, json.JSONDecodeError, Decimal.InvalidOperation, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Vercel billing data could not be read") from exc


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
            "note": "Measured single-agent and multi-agent RAG answer-generation tokens only. Embeddings and provider invoices are shown separately in the admin cloud-billing view. Cost is an estimate and is omitted when token rates are not configured.",
        }
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=503, detail="FinOps usage data unavailable") from exc
