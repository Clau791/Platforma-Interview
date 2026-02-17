from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./dev.db"
    jwt_secret: str = "change_me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_whisper_model: str = "whisper-1"
    openai_tts_model: str = "tts-1"
    openai_tts_voice: str = "alloy"
    openai_timeout_seconds: int = 20
    cors_origins: str = "http://localhost:5173"
    sqlite_fallback_url: str = "sqlite:///./dev.db"
    db_connect_retries: int = 5
    db_connect_delay_seconds: int = 2
    sandbox_image: str = "aic_sandbox_runner"
    sandbox_timeout_seconds: int = 5
    sandbox_memory_mb: int = 256
    sandbox_cpu: float = 0.5
    sandbox_pids_limit: int = 64
    ai_provider: str = "openai"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-pro"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
