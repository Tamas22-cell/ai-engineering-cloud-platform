import io
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from api.rag_upload import router
from core.database import get_db
from core.dependencies import get_current_user


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)

    db = AsyncMock()
    db.add = MagicMock()

    async def fake_db():
        yield db

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_current_user] = (
        lambda: SimpleNamespace(id="test-user")
    )

    with TestClient(app) as test_client:
        yield test_client, db


def make_pdf():
    buffer = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    writer.write(buffer)
    return buffer.getvalue()


def test_upload_pdf_success(client):
    test_client, db = client

    response = test_client.post(
        "/rag/upload",
        files={
            "file": (
                "manual.pdf",
                make_pdf(),
                "application/pdf",
            )
        },
    )

    assert response.status_code == 201
    assert response.json()["filename"] == "manual.pdf"
    assert response.json()["pages"] == 1
    assert response.json()["status"] == "stored"
    assert db.add.call_count == 1
    db.commit.assert_awaited_once()


def test_upload_rejects_invalid_extension(client):
    test_client, db = client

    response = test_client.post(
        "/rag/upload",
        files={"file": ("test.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 400
    db.commit.assert_not_awaited()


def test_upload_rejects_invalid_pdf(client):
    test_client, db = client

    response = test_client.post(
        "/rag/upload",
        files={
            "file": (
                "invalid.pdf",
                b"%PDF-not-a-valid-document",
                "application/pdf",
            )
        },
    )

    assert response.status_code == 400
    db.commit.assert_not_awaited()


def test_upload_rejects_large_pdf(client):
    test_client, db = client

    response = test_client.post(
        "/rag/upload",
        files={
            "file": (
                "large.pdf",
                b"%PDF-" + b"x" * (10 * 1024 * 1024),
                "application/pdf",
            )
        },
    )

    assert response.status_code == 413
    db.commit.assert_not_awaited()


def test_upload_requires_authentication():
    app = FastAPI()
    app.include_router(router)

    with TestClient(app) as client:
        response = client.post(
            "/rag/upload",
            files={
                "file": (
                    "manual.pdf",
                    make_pdf(),
                    "application/pdf",
                )
            },
        )

    assert response.status_code == 401
