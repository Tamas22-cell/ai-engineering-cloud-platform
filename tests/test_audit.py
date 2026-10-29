from unittest.mock import MagicMock, AsyncMock
import pytest

from core.audit import record_audit_event
from models.audit_log import AuditLog


@pytest.mark.asyncio
async def test_record_audit_event():
    db = MagicMock()
    db.flush = AsyncMock()

    event = await record_audit_event(
        db=db,
        event_type="login_success",
        user_id="test-user-123",
        ip_address="127.0.0.1",
    )

    assert isinstance(event, AuditLog)
    assert event.event_type == "login_success"
    assert event.user_id == "test-user-123"
    assert event.ip_address == "127.0.0.1"

    db.add.assert_called_once_with(event)
    db.flush.assert_awaited_once()
