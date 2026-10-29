from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from main import app
from core.dependencies import get_current_user


@pytest.mark.parametrize(
    "role, expected_status",
    [
        ("viewer", 403),
        ("developer", 403),
        ("admin", 200),
    ],
)
def test_admin_dashboard_roles(role, expected_status):
    async def mock_user():
        return SimpleNamespace(role=role, is_active=True)

    app.dependency_overrides[get_current_user] = mock_user

    try:
        with TestClient(app) as client:
            response = client.get("/admin/dashboard")

        assert response.status_code == expected_status

        if expected_status == 200:
            assert response.json()["role"] == "admin"
        else:
            assert response.json()["detail"] == "Insufficient permissions"
    finally:
        app.dependency_overrides.clear()
