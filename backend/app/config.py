from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


@dataclass
class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./triplogic.db",
    )
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    allowed_origins: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
        self.allowed_origins = [origin.strip() for origin in origins.split(",") if origin.strip()]


settings = Settings()
