from fastapi.testclient import TestClient
from main import app


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
