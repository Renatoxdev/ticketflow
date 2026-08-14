from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.models import CheckoutStatus, Payment, PaymentStatus, Ticket, TicketStatus


class PaymentCreate(BaseModel):
    event_id: UUID
    seat_label: str | None = Field(default=None, min_length=2, max_length=8)
    seat_labels: list[str] | None = None

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    @field_validator("seat_labels")
    @classmethod
    def validate_seat_labels(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        if not value:
            raise ValueError("Escolha pelo menos um assento.")
        for seat_label in value:
            cleaned = seat_label.strip()
            if len(cleaned) < 2 or len(cleaned) > 8:
                raise ValueError("Cada assento precisa ter entre 2 e 8 caracteres.")
        return value


class PaymentRead(BaseModel):
    id: UUID
    event_id: UUID
    customer_id: UUID
    ticket_id: UUID | None
    seat_label: str
    seat_labels: list[str]
    amount: Decimal
    pix_code: str
    qr_payload: str
    status: PaymentStatus
    expires_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_payment(cls, payment: "Payment") -> "PaymentRead":
        seat_labels = [seat.seat_label for seat in payment.seats] or [payment.seat_label]
        return cls(
            id=payment.id,
            event_id=payment.event_id,
            customer_id=payment.customer_id,
            ticket_id=payment.ticket_id,
            seat_label=seat_labels[0],
            seat_labels=seat_labels,
            amount=payment.amount,
            pix_code=payment.pix_code,
            qr_payload=payment.qr_payload,
            status=payment.status,
            expires_at=payment.expires_at,
            created_at=payment.created_at,
        )


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


class TicketListRead(BaseModel):
    tickets: list[TicketRead]


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
