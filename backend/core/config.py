from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/aiplatform"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        """Render uses standard postgres URLs; SQLAlchemy needs an async driver."""
        if isinstance(value, str):
            if value.startswith("postgres://"):
                return "postgresql+asyncpg://" + value[len("postgres://"):]
            if value.startswith("postgresql://"):
                return "postgresql+asyncpg://" + value[len("postgresql://"):]
        return value

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
