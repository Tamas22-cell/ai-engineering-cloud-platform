from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.rag_index import router
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

    indexer = AsyncMock(return_value=3)
    monkeypatch.setattr("api.rag_index.index_stored_pdf", indexer)

    with TestClient(app) as test_client:
        yield test_client, indexer


def test_index_document_success(client):
    test_client, indexer = client

    response = test_client.post("/rag/index/doc-1")

    assert response.status_code == 200
    assert response.json() == {
        "document_id": "doc-1",
        "chunks_indexed": 3,
        "status": "indexed",
    }

    assert indexer.await_args.kwargs["user_id"] == "user-A"
    assert indexer.await_args.kwargs["document_id"] == "doc-1"


def test_index_document_not_found(client):
    test_client, indexer = client
    indexer.side_effect = ValueError("Document not found")

    response = test_client.post("/rag/index/doc-2")

    assert response.status_code == 404


def test_index_document_empty_pdf(client):
    test_client, indexer = client
    indexer.side_effect = ValueError(
        "PDF contains no extractable text"
    )

    response = test_client.post("/rag/index/doc-1")

    assert response.status_code == 422


def test_index_document_service_failure(client):
    test_client, indexer = client
    indexer.side_effect = RuntimeError("Database unavailable")

    response = test_client.post("/rag/index/doc-1")

    assert response.status_code == 503


def test_index_document_requires_authentication():
    app = FastAPI()
    app.include_router(router)

    with TestClient(app) as client:
        response = client.post("/rag/index/doc-1")

    assert response.status_code == 401
