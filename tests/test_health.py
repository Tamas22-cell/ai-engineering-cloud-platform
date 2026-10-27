from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from core.database import get_db


@pytest.mark.asyncio
async def test_liveness():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/health/live")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_readiness_database_connected():
    mock_db = AsyncMock()

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/health/ready")

        assert response.status_code == 200
        assert response.json() == {
            "status": "ready",
            "database": "connected",
        }
        mock_db.execute.assert_awaited_once()

    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_readiness_database_disconnected():
    mock_db = AsyncMock()
    mock_db.execute.side_effect = ConnectionError(
        "Database unavailable"
    )

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/health/ready")

        assert response.status_code == 503
        assert response.json() == {
            "status": "not_ready",
            "database": "disconnected",
        }

    finally:
        app.dependency_overrides.clear()