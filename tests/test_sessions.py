from core.dependencies import get_current_user
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient

from main import app
from core.database import get_db
from core.security import create_access_token, create_refresh_token


def test_logout_revokes_refresh_token():
    token = create_refresh_token(str(uuid4()))

    from jose import jwt
    from core.config import settings

    user_id = jwt.decode(
        token, settings.secret_key,
        algorithms=[settings.algorithm]
    )["sub"]

    async def fake_user():
        return SimpleNamespace(id=user_id, is_active=True)

    logout_route = next(
        route for route in app.routes
        if route.path == "/auth/logout"
    )
    logout_dependency = logout_route.dependant.dependencies[0].call
    app.dependency_overrides[logout_dependency] = fake_user
    try:
        with patch(
            "api.auth.revoke_refresh_token",
            new_callable=AsyncMock,
        ) as revoke:
            with TestClient(app) as client:
                response = client.post(
                    "/auth/logout",
                    json={"refresh_token": token},
                    headers={"Authorization": f"Bearer {create_access_token(user_id)}"},
                )

        assert response.status_code == 200
        revoke.assert_awaited_once()
    finally:
        app.dependency_overrides.pop(logout_dependency, None)

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
            patch("api.auth.save_audit_event", new_callable=AsyncMock),
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
