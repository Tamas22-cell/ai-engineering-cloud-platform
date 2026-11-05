from types import SimpleNamespace

import pytest
from core.dependencies import get_current_user
from fastapi.testclient import TestClient
from main import app


@pytest.fixture(autouse=True)
def authenticated_user(monkeypatch):
    monkeypatch.setitem(
        app.dependency_overrides,
        get_current_user,
        lambda: SimpleNamespace(id="agent-test-user", role="viewer"),
    )


def test_agent_chat_success():
    with TestClient(app) as client:
        response = client.post(
            "/agents/chat",
            json={"message": "Hello AI"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "response": "AI Agent received: Hello AI"
    }


def test_agent_chat_empty_message():
    with TestClient(app) as client:
        response = client.post(
            "/agents/chat",
            json={"message": ""},
        )

    assert response.status_code == 422
