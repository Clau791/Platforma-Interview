from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./dev.db"
    jwt_secret: str = "change_me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 6000
    cors_origins: str = "http://localhost:5173"
    sqlite_fallback_url: str = "sqlite:///./dev.db"
    db_connect_retries: int = 5
    db_connect_delay_seconds: int = 2
    sandbox_image: str = "aic_sandbox_runner"
    sandbox_timeout_seconds: int = 5
    sandbox_memory_mb: int = 256
    sandbox_cpu: float = 0.5
    sandbox_pids_limit: int = 64
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash-live-001"
    gemini_text_model: str = "gemini-2.5-flash"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
