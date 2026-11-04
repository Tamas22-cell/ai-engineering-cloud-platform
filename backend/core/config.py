from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/aiplatform"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        """Normalize provider PostgreSQL URLs for SQLAlchemy's asyncpg driver."""
        if not isinstance(value, str):
            return value

        if value.startswith("postgres://"):
            value = "postgresql+asyncpg://" + value[len("postgres://"):]
        elif value.startswith("postgresql://"):
            value = "postgresql+asyncpg://" + value[len("postgresql://"):]

        # asyncpg expects the SSL option to be named "ssl", not libpq's
        # "sslmode". Leaving sslmode in the URL makes asyncpg.connect()
        # fail with: unexpected keyword argument 'sslmode'.
        parts = urlsplit(value)
        query_items = parse_qsl(parts.query, keep_blank_values=True)
        has_ssl = any(key.lower() == "ssl" for key, _ in query_items)
        normalized_query = []
        for key, item_value in query_items:
            if key.lower() == "sslmode":
                if not has_ssl:
                    normalized_query.append(("ssl", item_value))
                    has_ssl = True
            else:
                normalized_query.append((key, item_value))

        return urlunsplit(
            (parts.scheme, parts.netloc, parts.path, urlencode(normalized_query), parts.fragment)
        )

    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = "dev-secret-change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    environment: str = "local"
    log_level: str = "INFO"
    openai_api_key: str = ""
    cors_origins: str = "http://localhost:3000,https://ai-engineering-cloud-platform.vercel.app"

    @model_validator(mode="after")
    def validate_production_security(self):
        if self.environment.lower() in {"production", "prod"}:
            if (
                self.secret_key == "dev-secret-change-me-in-production"
                or len(self.secret_key) < 32
            ):
                raise ValueError("Production SECRET_KEY must be a strong, unique secret")
            if self.algorithm != "HS256":
                raise ValueError("Unsupported JWT algorithm")
        return self


settings = Settings()
