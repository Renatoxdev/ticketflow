from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import CheckoutStatus, PaymentStatus, Ticket, TicketStatus


class CheckoutCreate(BaseModel):
    event_id: UUID
    seat_label: str = Field(min_length=2, max_length=8)


class PaymentCreate(BaseModel):
    event_id: UUID
    seat_label: str = Field(min_length=2, max_length=8)


class PaymentRead(BaseModel):
    id: UUID
    event_id: UUID
    customer_id: UUID
    ticket_id: UUID | None
    seat_label: str
    amount: Decimal
    pix_code: str
    qr_payload: str
    status: PaymentStatus
    expires_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TicketRead(BaseModel):
    id: UUID
    event_id: UUID
    customer_id: UUID
    public_token: str = Field(min_length=32, max_length=96)
    seat_label: str | None
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
    seat_label: str | None

    @classmethod
    def from_ticket(cls, ticket: Ticket) -> "TicketShare":
        return cls(
            ticket_id=ticket.id,
            event_id=ticket.event_id,
            token=ticket.public_token,
            qr_payload=ticket.public_token,
            status=ticket.status,
            seat_label=ticket.seat_label,
        )


class CustomerTicketRead(BaseModel):
    ticket_id: UUID
    event_id: UUID
    title: str
    image_url: str | None
    starts_at: datetime
    venue: str
    seat_label: str | None
    token: str
    qr_payload: str
    status: TicketStatus
    paid_amount: Decimal
