from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from models.audit_log import AuditLog
from models.user import User
from core.rbac import require_role

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard")
async def admin_dashboard(
    user: User = Depends(require_role("admin")),
):
    return {
        "status": "ok",
        "message": "Admin access granted",
        "role": user.role,
    }


@router.get("/audit-logs")
async def list_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Return recent security events to administrators only."""
    result = await db.execute(
        select(AuditLog)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
        .offset(offset)
    )
    events = result.scalars().all()
    return {
        "items": [
            {
                "id": event.id,
                "event_type": event.event_type,
                "user_id": event.user_id,
                "ip_address": event.ip_address,
                "created_at": event.created_at,
            }
            for event in events
        ],
        "limit": limit,
        "offset": offset,
    }
