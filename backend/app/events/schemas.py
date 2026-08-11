from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.db.models import EventStatus


class EventBase(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=10)
    image_url: HttpUrl | None = None
    starts_at: datetime
    venue: str = Field(min_length=2, max_length=200)
    capacity: int = Field(gt=0)
    price: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    external_source: str | None = Field(default=None, max_length=50)
    external_id: str | None = Field(default=None, max_length=120)


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, min_length=10)
    image_url: HttpUrl | None = None
    starts_at: datetime | None = None
    venue: str | None = Field(default=None, min_length=2, max_length=200)
    capacity: int | None = Field(default=None, gt=0)
    price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)


class EventRead(EventBase):
    id: UUID
    organizer_id: UUID
    status: EventStatus
    sold_count: int
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
