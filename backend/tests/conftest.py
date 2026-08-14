import os

import pytest

os.environ.setdefault("DEEPGRAM_API_KEY", "test-deepgram-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://meet:meet@localhost:5432/meet_transcription"
)


@pytest.fixture(autouse=True)
def _env() -> None:
    pass
