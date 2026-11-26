from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from api import unified_agent as unified_agent_api
from main import app


def test_unified_agent_invoke_requires_authentication(monkeypatch):
    create_agent = AsyncMock()
    monkeypatch.setattr(unified_agent_api, "create_unified_agent", create_agent)

    with TestClient(app) as client:
        response = client.post("/agent/invoke", json={"message": "Do not call tools."})

    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"
    create_agent.assert_not_awaited()
