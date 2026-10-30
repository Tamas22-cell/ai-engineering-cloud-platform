from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/aiplatform"
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = "dev-secret-change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    environment: str = "local"
    log_level: str = "INFO"
    openai_api_key: str = ""
    cors_origins: str = "http://localhost:3000,https://ai-engineering-cloud-platform.vercel.app"


settings = Settings()
