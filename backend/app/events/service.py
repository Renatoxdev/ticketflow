from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.db.models import Event, EventStatus, Payment, PaymentStatus, Ticket, TicketStatus, User
from app.events.schemas import EventCreate, EventUpdate, SeatRead


def create_published_event(db: Session, organizer: User, data: EventCreate) -> Event:
    event = Event(
        organizer_id=organizer.id,
        title=data.title,
        description=data.description,
        image_url=str(data.image_url) if data.image_url else None,
        starts_at=data.starts_at,
        venue=data.venue,
        capacity=data.capacity,
        price=data.price,
        status=EventStatus.PUBLISHED,
        external_source=data.external_source,
        external_id=data.external_id,
        published_at=datetime.now(UTC),
    )

    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_available_events(
    db: Session,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    max_price: float | None = None,
) -> list[Event]:
    statement = select(Event).where(Event.status == EventStatus.PUBLISHED, Event.starts_at >= datetime.now(UTC))
    if q:
        search = f"%{q.lower()}%"
        statement = statement.where(
            func.lower(Event.title).like(search) | func.lower(Event.venue).like(search),
        )
    if date_from:
        statement = statement.where(Event.starts_at >= date_from)
    if date_to:
        statement = statement.where(Event.starts_at <= date_to)
    if max_price is not None:
        statement = statement.where(Event.price <= max_price)

    statement = statement.order_by(Event.starts_at.asc())
    return list(db.scalars(statement))


def get_event_for_organizer(db: Session, event_id: UUID, organizer: User) -> Event | None:
    statement = select(Event).where(Event.id == event_id, Event.organizer_id == organizer.id)
    return db.scalar(statement)


def list_organizer_events(db: Session, organizer: User) -> list[Event]:
    statement = select(Event).where(Event.organizer_id == organizer.id).order_by(Event.starts_at.desc())
    return list(db.scalars(statement))


def update_organizer_event(db: Session, event_id: UUID, organizer: User, data: EventUpdate) -> Event:
    event = get_event_for_organizer(db, event_id, organizer)
    if event is None:
        raise NotFoundError("Sessão não encontrada.")
    if event.status == EventStatus.CANCELLED:
        raise ConflictError("Sessão cancelada não pode ser editada.")

    values = data.model_dump(exclude_unset=True)
    if "image_url" in values and values["image_url"] is not None:
        values["image_url"] = str(values["image_url"])

    if "capacity" in values:
        sold_count = db.scalar(
            select(func.count(Ticket.id)).where(
                Ticket.event_id == event.id,
                Ticket.status.in_([TicketStatus.VALID, TicketStatus.USED]),
            )
        )
        if sold_count is not None and values["capacity"] < sold_count:
            raise ConflictError("A capacidade não pode ser menor que os ingressos vendidos.")

    for field, value in values.items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)
    return event


def cancel_organizer_event(db: Session, event_id: UUID, organizer: User) -> Event:
    event = get_event_for_organizer(db, event_id, organizer)
    if event is None:
        raise NotFoundError("Sessão não encontrada.")

    event.status = EventStatus.CANCELLED
    for ticket in event.tickets:
        if ticket.status == TicketStatus.VALID:
            ticket.status = TicketStatus.CANCELLED

    db.commit()
    db.refresh(event)
    return event


def build_seat_label(index: int) -> str:
    row = chr(ord("A") + (index // 10))
    number = (index % 10) + 1
    return f"{row}{number}"


def list_event_seats(db: Session, event_id: UUID) -> list[SeatRead]:
    event = db.get(Event, event_id)
    if event is None or event.status != EventStatus.PUBLISHED:
        raise NotFoundError("Sessão não encontrada.")

    now = datetime.now(UTC)
    expired_payments = db.scalars(
        select(Payment).where(
            Payment.event_id == event.id,
            Payment.status == PaymentStatus.PENDING,
            Payment.expires_at <= now,
        )
    )
    released_any = False
    for payment in expired_payments:
        payment.status = PaymentStatus.FAILED
        released_any = True
    if released_any:
        db.commit()

    sold_seats = {
        seat
        for seat in db.scalars(
            select(Ticket.seat_label).where(
                Ticket.event_id == event.id,
                Ticket.status.in_([TicketStatus.VALID, TicketStatus.USED]),
                Ticket.seat_label.is_not(None),
            )
        )
        if seat
    }
    reserved_seats = {
        seat
        for seat in db.scalars(
            select(Payment.seat_label).where(
                Payment.event_id == event.id,
                Payment.status == PaymentStatus.PENDING,
                Payment.expires_at > datetime.now(UTC),
            )
        )
        if seat
    }

    return [
        SeatRead(label=label, status=seat_status(label, sold_seats, reserved_seats))
        for label in (build_seat_label(index) for index in range(event.capacity))
    ]


def seat_status(label: str, sold_seats: set[str], reserved_seats: set[str]) -> str:
    if label in sold_seats:
        return "sold"
    if label in reserved_seats:
        return "reserved"
    return "available"
