from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient

from main import app
from core.database import get_db
from core.security import create_refresh_token


def test_logout_revokes_refresh_token():
    token = create_refresh_token(str(uuid4()))

    with patch(
        "api.auth.revoke_refresh_token",
        new_callable=AsyncMock,
    ) as revoke:
        with TestClient(app) as client:
            response = client.post(
                "/auth/logout",
                json={"refresh_token": token},
            )

    assert response.status_code == 200
    revoke.assert_awaited_once()


def test_refresh_token_single_use():
    user_id = str(uuid4())
    token = create_refresh_token(user_id)

    class FakeResult:
        def scalar_one_or_none(self):
            return SimpleNamespace(id=user_id, is_active=True)

    class FakeDB:
        async def execute(self, statement):
            return FakeResult()

    async def fake_db():
        yield FakeDB()

    async def consume_once(token_value):
        if not hasattr(consume_once, "used"):
            consume_once.used = True
            return True
        return False

    app.dependency_overrides[get_db] = fake_db

    try:
        with (
            patch("api.auth.consume_refresh_token", side_effect=consume_once),
            patch("api.auth.save_refresh_token", new_callable=AsyncMock),
            TestClient(app) as client,
        ):
            first = client.post(
                "/auth/refresh",
                json={"refresh_token": token},
            )
            second = client.post(
                "/auth/refresh",
                json={"refresh_token": token},
            )

        assert first.status_code == 200
        assert second.status_code == 401
        assert first.json()["refresh_token"]

    finally:
        app.dependency_overrides.clear()
