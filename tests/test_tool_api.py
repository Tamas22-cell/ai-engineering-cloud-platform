from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from langgraph.errors import GraphRecursionError

from main import app
from core.dependencies import get_current_user


@pytest.fixture
def authenticated_user():
    async def fake_user():
        return SimpleNamespace(id="test-user", is_active=True)

    app.dependency_overrides[get_current_user] = fake_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


def test_tool_chat_requires_auth():
    with TestClient(app) as client:
        response = client.post(
            "/agents/tool-chat",
            json={"message": "Calculate 15 + 27"},
        )

    assert response.status_code in (401, 403)


def test_tool_chat_success(authenticated_user):
    with patch(
        "api.agents.run_gpt_tool_agent",
        new_callable=AsyncMock,
        return_value={
            "messages": [AIMessage(content="15 + 27 = 42")]
        },
    ) as mock_agent:
        with TestClient(app) as client:
            response = client.post(
                "/agents/tool-chat",
                json={"message": "Calculate 15 + 27"},
            )

    assert response.status_code == 200
    assert response.json() == {"response": "15 + 27 = 42"}
    mock_agent.assert_awaited_once_with("Calculate 15 + 27")


def test_tool_chat_step_limit(authenticated_user):
    with patch(
        "api.agents.run_gpt_tool_agent",
        new_callable=AsyncMock,
        side_effect=GraphRecursionError("Step limit reached"),
    ):
        with TestClient(app) as client:
            response = client.post(
                "/agents/tool-chat",
                json={"message": "Test"},
            )

    assert response.status_code == 429
    assert response.json()["detail"] == "Agent step limit exceeded"


def test_tool_chat_service_failure(authenticated_user):
    with patch(
        "api.agents.run_gpt_tool_agent",
        new_callable=AsyncMock,
        side_effect=RuntimeError("Simulated error"),
    ):
        with TestClient(app) as client:
            response = client.post(
                "/agents/tool-chat",
                json={"message": "Test"},
            )

    assert response.status_code == 503
    assert response.json()["detail"] == "AI tool service unavailable"
