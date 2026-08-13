from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class ExternalSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=80)


class ExternalCatalogItem(BaseModel):
    external_source: str = "tmdb"
    external_id: str
    title: str
    description: str | None = None
    image_url: HttpUrl | None = None
    raw_payload: dict[str, Any]
