from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, SoldOutError
from app.db.models import CheckoutStatus, Event, EventStatus, Payment, PaymentStatus, Ticket, TicketStatus, User
from app.events.service import build_seat_label

PAYMENT_RESERVATION_MINUTES = 15


def buy_ticket(db: Session, event_id: UUID, seat_label: str, customer: User) -> Ticket:
    try:
        with db.begin():
            event = get_event_for_checkout(db, event_id, seat_label)
            ticket = build_ticket(event, customer, seat_label)
            db.add(ticket)
    except IntegrityError as exc:
        db.rollback()
        if is_unique_constraint_error(exc):
            raise ConflictError("Este assento já foi vendido.") from exc
        raise

    db.refresh(ticket)
    return ticket


def create_pix_payment(db: Session, event_id: UUID, seat_label: str, customer: User) -> Payment:
    try:
        with db.begin():
            release_expired_payments(db)
            event = get_event_for_checkout(db, event_id, seat_label)
            payment = Payment(
                event_id=event.id,
                customer_id=customer.id,
                seat_label=seat_label,
                amount=event.price,
                status=PaymentStatus.PENDING,
                expires_at=datetime.now(UTC) + timedelta(minutes=PAYMENT_RESERVATION_MINUTES),
            )
            db.add(payment)
    except IntegrityError as exc:
        db.rollback()
        if is_unique_constraint_error(exc):
            raise ConflictError("Este assento está reservado em outro pagamento.") from exc
        raise

    db.refresh(payment)
    return payment


def approve_pix_payment(db: Session, payment_id: UUID, customer: User) -> Ticket:
    try:
        with db.begin():
            release_expired_payments(db)
            payment = db.scalar(select(Payment).where(Payment.id == payment_id).with_for_update())
            if payment is None or payment.customer_id != customer.id:
                raise NotFoundError("Não encontramos esta cobrança Pix.")
            if payment.status == PaymentStatus.FAILED:
                raise ConflictError("Esta cobrança Pix já foi recusada.")
            if payment.expires_at <= datetime.now(UTC):
                payment.status = PaymentStatus.FAILED
                raise ConflictError("Esta cobrança Pix expirou. Gere uma nova tentativa de pagamento.")
            if payment.status == PaymentStatus.PAID:
                ticket = payment.ticket
                if ticket is None:
                    raise ConflictError("Pagamento aprovado sem ingresso vinculado.")
                return ticket

            event = get_event_for_checkout(db, payment.event_id, payment.seat_label, ignored_payment_id=payment.id)
            ticket = build_ticket(event, customer, payment.seat_label)
            ticket.checkout_reference = payment.id
            db.add(ticket)
            db.flush()

            payment.status = PaymentStatus.PAID
            payment.ticket_id = ticket.id
    except IntegrityError as exc:
        db.rollback()
        if is_unique_constraint_error(exc):
            raise ConflictError("Este assento já foi vendido.") from exc
        raise

    db.refresh(ticket)
    return ticket


def fail_pix_payment(db: Session, payment_id: UUID, customer: User) -> Payment:
    payment = db.scalar(select(Payment).where(Payment.id == payment_id))
    if payment is None or payment.customer_id != customer.id:
        raise NotFoundError("Não encontramos esta cobrança Pix.")
    if payment.status == PaymentStatus.PAID:
        raise ConflictError("Pagamento já aprovado não pode ser recusado.")

    payment.status = PaymentStatus.FAILED
    db.commit()
    db.refresh(payment)
    return payment


def get_customer_ticket(db: Session, ticket_id: UUID, customer: User) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None or ticket.customer_id != customer.id:
        raise NotFoundError("Não encontramos este ingresso na sua conta.")

    return ticket


def list_customer_tickets(db: Session, customer: User) -> list[Ticket]:
    statement = (
        select(Ticket)
        .join(Event)
        .where(Ticket.customer_id == customer.id)
        .order_by(Ticket.created_at.desc())
    )
    return list(db.scalars(statement))


def cancel_customer_ticket(db: Session, ticket_id: UUID, customer: User) -> Ticket:
    ticket = get_customer_ticket(db, ticket_id, customer)
    if ticket.status == TicketStatus.USED:
        raise ConflictError("Ingresso já utilizado não pode ser cancelado.")
    if ticket.status == TicketStatus.CANCELLED:
        return ticket

    ticket.status = TicketStatus.CANCELLED
    db.commit()
    db.refresh(ticket)
    return ticket


def get_ticket_by_public_token(db: Session, token: str) -> Ticket:
    ticket = db.scalar(select(Ticket).where(Ticket.public_token == token))
    if ticket is None:
        raise NotFoundError("Não encontramos este ingresso.")

    return ticket


def get_event_for_checkout(
    db: Session,
    event_id: UUID,
    seat_label: str,
    ignored_payment_id: UUID | None = None,
) -> Event:
    event = db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    if event is None or event.status != EventStatus.PUBLISHED:
        raise NotFoundError("Esta sessão não está disponível para compra.")

    valid_seats = {build_seat_label(index) for index in range(event.capacity)}
    if seat_label not in valid_seats:
        raise ConflictError("Este assento não existe nesta sessão.")

    sold_tickets = db.scalar(
        select(func.count(Ticket.id)).where(
            Ticket.event_id == event.id,
            Ticket.status.in_([TicketStatus.VALID, TicketStatus.USED]),
        )
    )

    if sold_tickets is not None and sold_tickets >= event.capacity:
        raise SoldOutError()

    sold_seat = db.scalar(
        select(Ticket.id).where(
            Ticket.event_id == event.id,
            Ticket.seat_label == seat_label,
            Ticket.status.in_([TicketStatus.VALID, TicketStatus.USED]),
        )
    )
    if sold_seat is not None:
        raise ConflictError("Este assento já foi vendido.")

    reserved_seat = db.scalar(
        select(Payment.id).where(
            Payment.event_id == event.id,
            Payment.id != ignored_payment_id,
            Payment.seat_label == seat_label,
            Payment.status == PaymentStatus.PENDING,
            Payment.expires_at > datetime.now(UTC),
        )
    )
    if reserved_seat is not None:
        raise ConflictError("Este assento está reservado em outro pagamento.")

    return event


def build_ticket(event: Event, customer: User, seat_label: str) -> Ticket:
    return Ticket(
        event_id=event.id,
        customer_id=customer.id,
        seat_label=seat_label,
        paid_amount=event.price,
        status=TicketStatus.VALID,
        checkout_status=CheckoutStatus.CONFIRMED,
    )


def is_unique_constraint_error(exc: IntegrityError) -> bool:
    return (
        "uq_check_ins_ticket_id" in str(exc.orig)
        or "uq_tickets_event_seat" in str(exc.orig)
        or "uq_pending_payments_event_seat" in str(exc.orig)
        or "tickets_checkout_reference_key" in str(exc.orig)
    )


def release_expired_payments(db: Session) -> None:
    expired_payments = db.scalars(
        select(Payment).where(
            Payment.status == PaymentStatus.PENDING,
            Payment.expires_at <= datetime.now(UTC),
        )
    )
    for payment in expired_payments:
        payment.status = PaymentStatus.FAILED
