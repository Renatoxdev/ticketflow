from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CheckInRequest(BaseModel):
    token: str = Field(min_length=32, max_length=96)


class CheckInRead(BaseModel):
    id: UUID
    ticket_id: UUID
    gate_operator_id: UUID
    checked_in_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GateValidationResult(BaseModel):
    status: str
    message: str
    ticket_id: UUID | None = None
    checked_in_at: datetime | None = None
