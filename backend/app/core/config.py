from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.cors import parse_extra_cors_origins


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    deepgram_api_key: str
    gemini_api_key: str
    database_url: str = "postgresql+asyncpg://meet:meet@localhost:5432/meet_transcription"
    deepgram_model: str = "nova-3"
    llm_model: str = "gemini-2.5-flash"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = ""
    log_level: str = "INFO"

    @property
    def cors_extra_origin_list(self) -> list[str]:
        return parse_extra_cors_origins(self.cors_origins)


settings = Settings()
