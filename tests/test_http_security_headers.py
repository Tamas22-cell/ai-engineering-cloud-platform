"""Regression tests for HTTP response security headers."""
from fastapi.testclient import TestClient
from main import app


def test_security_headers_on_success_response():
    with TestClient(app) as client:
        response = client.get("/")
    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers.get("X-Request-ID")


def test_security_headers_on_unauthenticated_response():
    with TestClient(app) as client:
        response = client.get("/auth/me")
    assert response.status_code == 401
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response.headers["X-Frame-Options"] == "DENY"
