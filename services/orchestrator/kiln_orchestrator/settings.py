from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True, slots=True)
class Settings:
    environment: str
    service_token: str
    max_request_bytes: int
    planner_mode: str
    openai_api_key: str
    openai_model: str
    openai_timeout_seconds: float
    max_model_output_tokens: int

    @classmethod
    def from_environment(cls) -> Settings:
        return cls(
            environment=os.getenv("KILN_ENV", "development"),
            service_token=os.getenv("KILN_SERVICE_TOKEN", ""),
            max_request_bytes=int(os.getenv("KILN_MAX_REQUEST_BYTES", "262144")),
            planner_mode=os.getenv("KILN_PLANNER_MODE", "auto"),
            openai_api_key=os.getenv("OPENAI_API_KEY", ""),
            openai_model=os.getenv("KILN_OPENAI_MODEL", "gpt-5.6-terra"),
            openai_timeout_seconds=float(os.getenv("KILN_OPENAI_TIMEOUT_SECONDS", "30")),
            max_model_output_tokens=int(os.getenv("KILN_MAX_MODEL_OUTPUT_TOKENS", "6000")),
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_environment()
