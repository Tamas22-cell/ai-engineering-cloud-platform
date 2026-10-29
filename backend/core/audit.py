from sqlalchemy.ext.asyncio import AsyncSession

from models.audit_log import AuditLog


async def record_audit_event(
    db: AsyncSession,
    event_type: str,
    user_id: str | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Persist a security event without storing credentials or tokens."""

    event = AuditLog(
        event_type=event_type,
        user_id=user_id,
        ip_address=ip_address,
    )

    db.add(event)
    await db.flush()

    return event


from core.database import AsyncSessionLocal


async def save_audit_event(
    event_type: str,
    user_id: str | None = None,
    ip_address: str | None = None,
) -> None:
    async with AsyncSessionLocal() as db:
        await record_audit_event(
            db=db,
            event_type=event_type,
            user_id=user_id,
            ip_address=ip_address,
        )
        await db.commit()
