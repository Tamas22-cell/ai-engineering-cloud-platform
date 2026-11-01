"""Regression tests for API CORS and production security configuration."""
from fastapi.testclient import TestClient

from core.config import Settings
from main import app


def test_cors_preflight_allows_configured_frontend():
    client = TestClient(app)
    response = client.options(
        "/auth/login",
        headers={
            "Origin": "https://ai-engineering-cloud-platform.vercel.app",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://ai-engineering-cloud-platform.vercel.app"


def test_cors_rejects_unknown_origin():
    client = TestClient(app)
    response = client.options(
        "/auth/login",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.headers.get("access-control-allow-origin") != "https://untrusted.example"


def test_configured_cors_origins_have_no_wildcard():
    from core.config import settings
    assert "*" not in [origin.strip() for origin in settings.cors_origins.split(",")]


def test_production_secret_must_be_configured_in_deployment():
    # This is a configuration contract; avoid reading or exposing real secrets.
    from core.config import settings
    if settings.environment.lower() in {"production", "prod"}:
        assert settings.secret_key != "dev-secret-change-me-in-production", (
            "Production SECRET_KEY must not use the development default"
        )
