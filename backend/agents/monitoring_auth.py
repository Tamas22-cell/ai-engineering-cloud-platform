import os
import secrets

from fastapi import Header, HTTPException


async def require_monitoring_key(
    x_monitoring_key: str | None = Header(default=None)
):
    expected = os.getenv("MONITORING_API_KEY")

    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Monitoring authentication is not configured"
        )

    if not x_monitoring_key or not secrets.compare_digest(
        x_monitoring_key, expected
    ):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized"
        )
