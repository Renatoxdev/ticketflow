import secrets
import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.base import Base


class UserRole(StrEnum):
    ORGANIZER = "ORGANIZER"
    CUSTOMER = "CUSTOMER"
    GATE_OPERATOR = "GATE_OPERATOR"


class EventStatus(StrEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    CANCELLED = "CANCELLED"


class TicketStatus(StrEnum):
    VALID = "VALID"
    USED = "USED"
    CANCELLED = "CANCELLED"


class CheckoutStatus(StrEnum):
    CONFIRMED = "CONFIRMED"


class PaymentStatus(StrEnum):
    PENDING = "PENDING"
    PAID = "PAID"
    FAILED = "FAILED"


def generate_public_token() -> str:
    return secrets.token_urlsafe(32)


def generate_pix_code() -> str:
    return f"PIX-TICKETFLOW-{secrets.token_urlsafe(24)}"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    organized_events: Mapped[list["Event"]] = relationship(back_populates="organizer")
    tickets: Mapped[list["Ticket"]] = relationship(back_populates="customer")
    payments: Mapped[list["Payment"]] = relationship(back_populates="customer")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organizer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(1000))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    venue: Mapped[str] = mapped_column(String(200), nullable=False)
    capacity: Mapped[int] = mapped_column(nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[EventStatus] = mapped_column(
        Enum(EventStatus, name="event_status"),
        default=EventStatus.DRAFT,
        nullable=False,
    )
    external_source: Mapped[str | None] = mapped_column(String(50))
    external_id: Mapped[str | None] = mapped_column(String(120))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    organizer: Mapped[User] = relationship(back_populates="organized_events")
    tickets: Mapped[list["Ticket"]] = relationship(back_populates="event")
    payments: Mapped[list["Payment"]] = relationship(back_populates="event")

    @property
    def sold_count(self) -> int:
        return len([ticket for ticket in self.tickets if ticket.status in {TicketStatus.VALID, TicketStatus.USED}])

    __table_args__ = (
        CheckConstraint("capacity > 0", name="ck_events_capacity_positive"),
        CheckConstraint("price >= 0", name="ck_events_price_non_negative"),
        Index("ix_events_status_starts_at", "status", "starts_at"),
    )


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="RESTRICT"), nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    public_token: Mapped[str] = mapped_column(
        String(96),
        default=generate_public_token,
        nullable=False,
        unique=True,
        index=True,
    )
    seat_label: Mapped[str | None] = mapped_column(String(8))
    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus, name="ticket_status"),
        default=TicketStatus.VALID,
        nullable=False,
    )
    checkout_status: Mapped[CheckoutStatus] = mapped_column(
        Enum(CheckoutStatus, name="checkout_status"),
        default=CheckoutStatus.CONFIRMED,
        nullable=False,
    )
    checkout_reference: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, nullable=False, unique=True)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    checkout_confirmed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    event: Mapped[Event] = relationship(back_populates="tickets")
    customer: Mapped[User] = relationship(back_populates="tickets")
    check_in: Mapped["CheckIn | None"] = relationship(back_populates="ticket")
    payment: Mapped["Payment | None"] = relationship(back_populates="ticket")

    __table_args__ = (
        CheckConstraint("paid_amount >= 0", name="ck_tickets_paid_amount_non_negative"),
        Index("ix_tickets_event_status", "event_id", "status"),
        Index(
            "uq_tickets_event_seat",
            "event_id",
            "seat_label",
            unique=True,
            postgresql_where=text("seat_label IS NOT NULL AND status IN ('VALID', 'USED')"),
        ),
    )


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="RESTRICT"), nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    ticket_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tickets.id", ondelete="RESTRICT"), unique=True)
    seat_label: Mapped[str] = mapped_column(String(8), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    pix_code: Mapped[str] = mapped_column(String(120), default=generate_pix_code, nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"),
        default=PaymentStatus.PENDING,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    event: Mapped[Event] = relationship(back_populates="payments")
    customer: Mapped[User] = relationship(back_populates="payments")
    ticket: Mapped[Ticket | None] = relationship(back_populates="payment")

    @property
    def qr_payload(self) -> str:
        return self.pix_code

    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_payments_amount_non_negative"),
        Index("ix_payments_customer_status", "customer_id", "status"),
        Index(
            "uq_pending_payments_event_seat",
            "event_id",
            "seat_label",
            unique=True,
            postgresql_where=text("status = 'PENDING'"),
        ),
    )


class CheckIn(Base):
    __tablename__ = "check_ins"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tickets.id", ondelete="RESTRICT"), nullable=False)
    gate_operator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    checked_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    ticket: Mapped[Ticket] = relationship(back_populates="check_in")

    __table_args__ = (UniqueConstraint("ticket_id", name="uq_check_ins_ticket_id"),)
