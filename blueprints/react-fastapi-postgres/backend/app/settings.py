from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    # A credential-free local default keeps an accidental development launch safe.
    # Hosted and Compose environments must supply DATABASE_URL explicitly.
    database_url: str = "sqlite:///./kiln-dev.db"
    allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:4173"]

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
