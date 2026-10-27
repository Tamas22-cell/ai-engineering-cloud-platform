import structlog

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db

router = APIRouter(prefix="/health", tags=["health"])
logger = structlog.get_logger()


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