from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from main import app
from core.dependencies import get_current_user


def test_llm_chat_requires_auth():
    with TestClient(app) as client:
        response = client.post(
            "/agents/llm-chat",
            json={"message": "Hello GPT"},
        )

    assert response.status_code in (401, 403)


def test_llm_chat_success():
    async def fake_user():
        return SimpleNamespace(id="test-user", is_active=True)

    app.dependency_overrides[get_current_user] = fake_user

    try:
        with patch(
            "api.agents.llm_agent.ainvoke",
            new_callable=AsyncMock,
            return_value={
                "message": "Hello GPT",
                "response": "Hello from GPT!",
            },
        ) as mock_agent:
            with TestClient(app) as client:
                response = client.post(
                    "/agents/llm-chat",
                    json={"message": "Hello GPT"},
                )

        assert response.status_code == 200
        assert response.json()["response"] == "Hello from GPT!"
        mock_agent.assert_awaited_once()

    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_llm_chat_service_failure():
    async def fake_user():
        return SimpleNamespace(id="test-user", is_active=True)

    app.dependency_overrides[get_current_user] = fake_user

    try:
        with patch(
            "api.agents.llm_agent.ainvoke",
            new_callable=AsyncMock,
            side_effect=RuntimeError("Simulated LLM failure"),
        ):
            with TestClient(app) as client:
                response = client.post(
                    "/agents/llm-chat",
                    json={"message": "Hello GPT"},
                )

        assert response.status_code == 503

    finally:
        app.dependency_overrides.pop(get_current_user, None)
