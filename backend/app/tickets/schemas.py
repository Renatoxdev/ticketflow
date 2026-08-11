from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import CheckoutStatus, Ticket, TicketStatus


class CheckoutCreate(BaseModel):
    event_id: UUID


class TicketRead(BaseModel):
    id: UUID
    event_id: UUID
    customer_id: UUID
    public_token: str = Field(min_length=32, max_length=96)
    status: TicketStatus
    checkout_status: CheckoutStatus
    checkout_reference: UUID
    paid_amount: Decimal
    checkout_confirmed_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TicketShare(BaseModel):
    ticket_id: UUID
    event_id: UUID
    token: str
    qr_payload: str
    status: TicketStatus

    @classmethod
    def from_ticket(cls, ticket: Ticket) -> "TicketShare":
        return cls(
            ticket_id=ticket.id,
            event_id=ticket.event_id,
            token=ticket.public_token,
            qr_payload=ticket.public_token,
            status=ticket.status,
        )
