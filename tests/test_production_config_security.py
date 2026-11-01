"""Production configuration security regression tests."""
import pytest
from pydantic import ValidationError

from core.config import Settings


@pytest.mark.parametrize("environment", ["production", "prod", "PRODUCTION"])
def test_production_rejects_default_secret(environment):
    with pytest.raises(ValidationError, match="Production SECRET_KEY"):
        Settings(_env_file=None, environment=environment,
                 secret_key="dev-secret-change-me-in-production")


def test_production_rejects_short_secret():
    with pytest.raises(ValidationError, match="Production SECRET_KEY"):
        Settings(_env_file=None, environment="production", secret_key="short-secret")


def test_production_accepts_strong_secret():
    settings = Settings(_env_file=None, environment="production",
                        secret_key="a" * 48, algorithm="HS256")
    assert settings.environment == "production"


def test_production_rejects_unsupported_algorithm():
    with pytest.raises(ValidationError, match="Unsupported JWT algorithm"):
        Settings(_env_file=None, environment="production",
                 secret_key="a" * 48, algorithm="none")
