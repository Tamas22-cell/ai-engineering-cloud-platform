from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.rag_documents import router
from core.database import get_db
from core.dependencies import get_current_user


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)

    db = AsyncMock()

    async def fake_db():
        yield db

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_current_user] = (
        lambda: SimpleNamespace(id="user-A")
    )

    with TestClient(app) as test_client:
        yield test_client, db


def test_list_own_documents(client):
    test_client, db = client

    document = SimpleNamespace(
        id="doc-1",
        filename="manual.pdf",
        file_size=1024,
        created_at=datetime.now(timezone.utc),
    )

    result = MagicMock()
    result.scalars.return_value.all.return_value = [document]
    db.execute.return_value = result

    response = test_client.get("/rag/documents")

    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert response.json()["documents"][0]["filename"] == "manual.pdf"

    statement = db.execute.await_args.args[0]
    assert "documents.user_id" in str(statement)
    assert statement.compile().params["user_id_1"] == "user-A"


def test_list_rejects_invalid_limit(client):
    test_client, db = client

    response = test_client.get("/rag/documents?limit=0")

    assert response.status_code == 422
    db.execute.assert_not_awaited()


def test_list_requires_authentication():
    app = FastAPI()
    app.include_router(router)

    with TestClient(app) as client:
        response = client.get("/rag/documents")

    assert response.status_code == 401


def test_delete_own_document_and_chunks(client):
    test_client, db = client
    found = MagicMock()
    found.scalar_one_or_none.return_value = SimpleNamespace(id="doc-1")
    db.execute.side_effect = [found, MagicMock(), MagicMock()]
    response = test_client.delete("/rag/documents/doc-1")
    assert response.status_code == 204
    assert db.execute.await_count == 3
    db.commit.assert_awaited_once()


def test_delete_missing_document_returns_404(client):
    test_client, db = client
    found = MagicMock()
    found.scalar_one_or_none.return_value = None
    db.execute.return_value = found
    response = test_client.delete("/rag/documents/unknown")
    assert response.status_code == 404
    db.commit.assert_not_awaited()
    assert db.execute.await_count == 1
