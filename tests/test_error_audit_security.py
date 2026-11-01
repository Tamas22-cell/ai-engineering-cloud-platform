"""Security regression tests for error responses and audit payloads."""
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from core.audit import record_audit_event
from main import app


def test_unauthenticated_error_does_not_leak_internal_details():
    with TestClient(app) as client:
        response = client.get("/auth/me")
    assert response.status_code == 401
    payload = response.json()
    assert payload == {"detail": "Not authenticated"}
    serialized = response.text.lower()
    for forbidden in ("traceback", "secret_key", "password", "database_url"):
        assert forbidden not in serialized


@pytest.mark.asyncio
async def test_audit_record_excludes_credentials():
    db = MagicMock()
    db.flush = AsyncMock()
    event = await record_audit_event(
        db=db, event_type="login_failed", user_id="user-123"
    )
    assert event.event_type == "login_failed"
    assert event.user_id == "user-123"
    assert not hasattr(event, "password")
    assert not hasattr(event, "access_token")
    assert not hasattr(event, "refresh_token")
    db.add.assert_called_once_with(event)
    db.flush.assert_awaited_once()
