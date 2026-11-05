import asyncio
import os
from datetime import datetime, timezone

import redis.asyncio as redis
import structlog

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.langfuse_tracing import create_langfuse_exporter
from core.rbac import require_role
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import SpanExportResult

router = APIRouter(prefix="/health", tags=["health"])
logger = structlog.get_logger()


class _ProbeSpanCollector(SpanProcessor):
    """Collect a single span so the OTLP export result can be checked directly."""

    def __init__(self):
        self.spans = []

    def on_start(self, span, parent_context=None) -> None:
        return None

    def on_end(self, span) -> None:
        self.spans.append(span)

    def shutdown(self) -> None:
        return None

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True


@router.get("/live")
async def liveness() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def readiness(
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    try:
        await db.execute(text("SELECT 1"))

        return {
            "status": "ready",
            "database": "connected",
        }

    except Exception as exc:
        logger.warning(
            "database_readiness_failed",
            error_type=type(exc).__name__,
        )

        response.status_code = (
            status.HTTP_503_SERVICE_UNAVAILABLE
        )

        return {
            "status": "not_ready",
            "database": "disconnected",
        }


@router.get("/integrations")
async def integration_health() -> dict[str, str]:
    """Report dependency connectivity without exposing connection details or secrets."""
    client = None
    try:
        client = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        await client.ping()
        redis_status = "connected"
    except Exception:
        redis_status = "disconnected"
    finally:
        if client is not None:
            try:
                await client.aclose()
            except Exception:
                pass

    langfuse_configured = bool(
        os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY")
    )
    return {
        "redis": redis_status,
        "langfuse": "configured" if langfuse_configured else "not_configured",
    }



@router.post("/integrations/langfuse-probe")
async def probe_langfuse_delivery(
    user=Depends(require_role("admin", "developer")),
) -> dict[str, str]:
    """Send a content-free OTLP test span and report the exporter response."""
    try:
        exporter = create_langfuse_exporter()
    except ValueError as exc:
        logger.error("langfuse_probe_configuration_invalid", error_type=type(exc).__name__)
        raise HTTPException(status_code=503, detail="Langfuse export configuration is invalid") from exc
    if exporter is None:
        raise HTTPException(status_code=409, detail="Langfuse export is not configured")

    collector = _ProbeSpanCollector()
    provider = TracerProvider(resource=Resource.create({"service.name": "ai-engineering-api"}))
    provider.add_span_processor(collector)
    tracer = provider.get_tracer("ai-engineering.langfuse-probe")
    try:
        with tracer.start_as_current_span("langfuse.delivery_probe") as span:
            span.set_attribute("probe.type", "delivery")
        result = await asyncio.to_thread(exporter.export, collector.spans)
        if result != SpanExportResult.SUCCESS:
            logger.warning("langfuse_probe_rejected", export_result=getattr(result, "name", "unknown"))
            raise HTTPException(status_code=502, detail="Langfuse did not confirm the test trace")
        logger.info("langfuse_probe_delivered")
        return {"status": "delivered", "checked_at": datetime.now(timezone.utc).isoformat()}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("langfuse_probe_failed", error_type=type(exc).__name__)
        raise HTTPException(status_code=502, detail="Langfuse test trace delivery failed") from exc
    finally:
        provider.shutdown()
        exporter.shutdown()
