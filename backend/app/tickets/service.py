from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError, SoldOutError
from app.db.models import CheckoutStatus, Event, EventStatus, Ticket, TicketStatus, User


def buy_ticket(db: Session, event_id: UUID, customer: User) -> Ticket:
    with db.begin():
        event = db.scalar(select(Event).where(Event.id == event_id).with_for_update())
        if event is None or event.status != EventStatus.PUBLISHED:
            raise NotFoundError("Esta sessão não está disponível para compra.")

        sold_tickets = db.scalar(
            select(func.count(Ticket.id)).where(
                Ticket.event_id == event.id,
                Ticket.status.in_([TicketStatus.VALID, TicketStatus.USED]),
            )
        )

        if sold_tickets is not None and sold_tickets >= event.capacity:
            raise SoldOutError()

        ticket = Ticket(
            event_id=event.id,
            customer_id=customer.id,
            paid_amount=event.price,
            status=TicketStatus.VALID,
            checkout_status=CheckoutStatus.CONFIRMED,
        )
        db.add(ticket)

    db.refresh(ticket)
    return ticket


def get_customer_ticket(db: Session, ticket_id: UUID, customer: User) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None or ticket.customer_id != customer.id:
        raise NotFoundError("Não encontramos este ingresso na sua conta.")

    return ticket


def get_ticket_by_public_token(db: Session, token: str) -> Ticket:
    ticket = db.scalar(select(Ticket).where(Ticket.public_token == token))
    if ticket is None:
        raise NotFoundError("Não encontramos este ingresso.")

    return ticket


def is_unique_constraint_error(exc: IntegrityError) -> bool:
    return "uq_check_ins_ticket_id" in str(exc.orig)
