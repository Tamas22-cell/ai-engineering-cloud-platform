
import pytest
from pydantic import ValidationError
from jose import jwt

from core.config import settings
from core.security import (
    hash_password,
    verify_password,
    create_access_token,
)
from schemas.auth import UserRegister


def test_password_hashing():
    password = "SecureTest123!"
    hashed = hash_password(password)

    assert hashed != password
    assert hashed.startswith("$argon2")
    assert verify_password(password, hashed)


def test_wrong_password():
    hashed = hash_password("SecureTest123!")

    assert not verify_password(
        "WrongPassword123!",
        hashed,
    )


def test_jwt_token():
    token = create_access_token("test-user-id")

    payload = jwt.decode(
        token,
        settings.secret_key,
        algorithms=[settings.algorithm],
    )

    assert payload["sub"] == "test-user-id"
    assert payload["type"] == "access"
    assert "exp" in payload


def test_registration_valid_data():
    user = UserRegister(
        email="TEST@Example.com",
        password="SecureTest123!",
    )

    assert user.email == "test@example.com"


def test_registration_invalid_email():
    with pytest.raises(ValidationError):
        UserRegister(
            email="invalid-email",
            password="SecureTest123!",
        )


def test_registration_short_password():
    with pytest.raises(ValidationError):
        UserRegister(
            email="test@example.com",
            password="123",
        )

def test_auth_me_requires_token():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)
    response = client.get("/auth/me")

    assert response.status_code in (401, 403)
    assert response.json()["detail"] == "Not authenticated"
