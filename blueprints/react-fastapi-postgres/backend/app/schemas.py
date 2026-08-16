from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class IngredientCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=120)
    unit: str = Field(min_length=1, max_length=24)
    quantity: float = Field(ge=0, le=1_000_000)
    reorder_level: float = Field(ge=0, le=1_000_000)


class IngredientUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: float = Field(ge=0, le=1_000_000)


class IngredientResponse(IngredientCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    updated_at: datetime
