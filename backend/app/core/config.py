from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    deepgram_api_key: str
    gemini_api_key: str
    database_url: str = "postgresql+asyncpg://meet:meet@localhost:5432/meet_transcription"
    deepgram_model: str = "nova-3"
    llm_model: str = "gemini-2.5-flash"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = "chrome-extension://*"
    log_level: str = "INFO"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
