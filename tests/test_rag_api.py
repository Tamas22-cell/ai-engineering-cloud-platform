from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.rag import router
from core.database import get_db
from core.dependencies import get_current_user


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(router)

    db = AsyncMock()

    async def fake_db():
        yield db

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_current_user] = (
        lambda: SimpleNamespace(id="user-A")
    )

    qa = AsyncMock()
    qa.ask.return_value = {
        "answer": "Python supports AI development [1].",
        "sources": [
            {"id": 1, "source": "manual.pdf", "page": 3}
        ],
    }

    monkeypatch.setattr(
        "api.rag.PersistentRAGQuestionAnswering",
        lambda: qa,
    )

    with TestClient(app) as test_client:
        yield test_client, qa, db


def test_rag_ask_success(client):
    test_client, qa, db = client

    response = test_client.post(
        "/rag/ask",
        json={"question": "What is Python?", "top_k": 3},
    )

    assert response.status_code == 200
    assert response.json()["sources"][0]["page"] == 3

    qa.ask.assert_awaited_once_with(
        db=db,
        user_id="user-A",
        question="What is Python?",
        top_k=3,
    )


def test_rag_ask_rejects_empty_question(client):
    test_client, qa, _ = client

    response = test_client.post(
        "/rag/ask",
        json={"question": "", "top_k": 3},
    )

    assert response.status_code == 422
    qa.ask.assert_not_awaited()


def test_rag_ask_rejects_invalid_top_k(client):
    test_client, qa, _ = client

    response = test_client.post(
        "/rag/ask",
        json={"question": "Python", "top_k": 0},
    )

    assert response.status_code == 422
    qa.ask.assert_not_awaited()


def test_rag_ask_service_failure(client):
    test_client, qa, _ = client
    qa.ask.side_effect = RuntimeError("Service error")

    response = test_client.post(
        "/rag/ask",
        json={"question": "What is RAG?"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "RAG service unavailable"


def test_rag_ask_requires_authentication():
    app = FastAPI()
    app.include_router(router)

    with TestClient(app) as test_client:
        response = test_client.post(
            "/rag/ask",
            json={"question": "What is RAG?"},
        )

    assert response.status_code == 401
