from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from core.config import settings
from core.dependencies import get_current_user
from core.security import create_access_token, create_refresh_token


@pytest.mark.asyncio
async def test_expired_access_token_rejected_without_db_query():
    expired = jwt.encode(
        {"sub": "test-id", "type": "access", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    db = AsyncMock()
    with pytest.raises(HTTPException) as exc:
        await get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=expired), db)
    assert exc.value.status_code == 401
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_refresh_token_cannot_access_protected_endpoint():
    db = AsyncMock()
    token = create_refresh_token("test-id")
    with pytest.raises(HTTPException) as exc:
        await get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), db)
    assert exc.value.status_code == 401
    db.execute.assert_not_awaited()


def test_new_access_token_has_access_type_and_expiry():
    token = create_access_token("test-id")
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    assert payload["type"] == "access"
    assert payload["sub"] == "test-id"
    assert payload["exp"] > datetime.now(timezone.utc).timestamp()
