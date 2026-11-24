"""Endpoint-level denial tests for model-registry role boundaries."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from core.database import get_db
from core.dependencies import get_current_user
from main import app


@pytest.fixture
def client(monkeypatch):
    async def fake_db():
        yield object()

    monkeypatch.setitem(app.dependency_overrides, get_db, fake_db)
    return TestClient(app)


def _user_with_role(role):
    async def current_user():
        return SimpleNamespace(id="rbac-test-user", role=role, is_active=True)

    return current_user


@pytest.mark.parametrize(
    ("role", "method", "path", "payload"),
    [
        (
            "viewer",
            "post",
            "/mlops/models",
            {"name": "test-model", "version": "v1", "framework": "test"},
        ),
        (
            "developer",
            "patch",
            "/mlops/models/not-used/stage",
            {"stage": "production"},
        ),
        (
            "viewer",
            "post",
            "/mlops/models/not-used/runs",
            {"metric_name": "accuracy", "metric_value": 0.9},
        ),
    ],
)
def test_model_write_endpoints_reject_insufficient_roles(
    client, monkeypatch, role, method, path, payload
):
    monkeypatch.setitem(
        app.dependency_overrides, get_current_user, _user_with_role(role)
    )

    response = client.request(method, path, json=payload)

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions"


def test_model_write_endpoint_requires_authentication(client):
    response = client.post(
        "/mlops/models",
        json={"name": "test-model", "version": "v1", "framework": "test"},
    )

    assert response.status_code == 401
