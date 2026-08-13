from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ConflictError, SoldOutError
from app.db import Base
from app.db.models import (
    CheckIn,
    CheckoutStatus,
    Event,
    EventStatus,
    Payment,
    PaymentStatus,
    Ticket,
    TicketStatus,
    User,
    UserRole,
)
from app.gate.service import check_in_ticket
from app.tickets.service import (
    approve_pix_payment,
    buy_ticket,
    create_pix_payment,
    fail_pix_payment,
    get_ticket_by_public_token,
)

TEST_DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/verzel_events"


@contextmanager
def isolated_postgres_sessionmaker():
    schema_name = f"test_{uuid4().hex}"
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"connect_timeout": 2, "options": f"-csearch_path={schema_name}"},
        pool_pre_ping=True,
    )

    try:
        with engine.connect() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema_name}"'))
            connection.commit()
    except OperationalError as exc:
        pytest.skip(f"PostgreSQL local indisponível para testes integrados: {exc}")

    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

    try:
        yield SessionLocal
    finally:
        Base.metadata.drop_all(engine)
        with engine.connect() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
            connection.commit()
        engine.dispose()


def seed_capacity_event(db: Session, capacity: int = 1) -> tuple[UUID, UUID, UUID, UUID]:
    organizer = User(
        name="Organizer",
        email=f"organizer-{uuid4()}@example.com",
        password_hash="hash",
        role=UserRole.ORGANIZER,
    )
    first_customer = User(
        name="Customer A",
        email=f"customer-a-{uuid4()}@example.com",
        password_hash="hash",
        role=UserRole.CUSTOMER,
    )
    second_customer = User(
        name="Customer B",
        email=f"customer-b-{uuid4()}@example.com",
        password_hash="hash",
        role=UserRole.CUSTOMER,
    )
    event = Event(
        organizer=organizer,
        title="Concurrency Test",
        description="Evento para testar compra concorrente.",
        starts_at=datetime.now(UTC) + timedelta(days=1),
        venue="Test Hall",
        capacity=capacity,
        price=Decimal("10.00"),
        status=EventStatus.PUBLISHED,
        published_at=datetime.now(UTC),
    )

    db.add_all([organizer, first_customer, second_customer, event])
    db.commit()

    return event.id, first_customer.id, second_customer.id, organizer.id


def authenticated_customer(customer_id: UUID) -> User:
    return User(
        id=customer_id,
        name="Authenticated Customer",
        email=f"authenticated-{customer_id}@example.com",
        password_hash="hash",
        role=UserRole.CUSTOMER,
    )


def test_concurrent_checkout_sells_last_ticket_once() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            event_id, first_customer_id, second_customer_id, _ = seed_capacity_event(db)

        def attempt_checkout(customer_id: UUID) -> str:
            with SessionLocal() as db:
                try:
                    buy_ticket(db, event_id, "A1", authenticated_customer(customer_id))
                    return "CONFIRMED"
                except SoldOutError:
                    return "SOLD_OUT"

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(attempt_checkout, [first_customer_id, second_customer_id]))

        with SessionLocal() as db:
            tickets_count = db.query(Ticket).filter(Ticket.event_id == event_id).count()

        assert sorted(results) == ["CONFIRMED", "SOLD_OUT"]
        assert tickets_count == 1


def test_concurrent_check_in_uses_ticket_once() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            event_id, customer_id, _, _ = seed_capacity_event(db, capacity=10)
            gate_operator = User(
                name="Gate",
                email=f"gate-{uuid4()}@example.com",
                password_hash="hash",
                role=UserRole.GATE_OPERATOR,
            )
            ticket = Ticket(
                event_id=event_id,
                customer_id=customer_id,
                seat_label="A1",
                paid_amount=Decimal("10.00"),
                status=TicketStatus.VALID,
                checkout_status=CheckoutStatus.CONFIRMED,
            )
            db.add_all([gate_operator, ticket])
            db.commit()
            token = ticket.public_token
            gate_operator_id = gate_operator.id

        def attempt_check_in() -> str:
            with SessionLocal() as db:
                gate_operator = User(
                    id=gate_operator_id,
                    name="Authenticated Gate",
                    email="gate@example.com",
                    password_hash="hash",
                )

                result = check_in_ticket(db, token, event_id, gate_operator)
                return result.status

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: attempt_check_in(), range(2)))

        with SessionLocal() as db:
            check_ins_count = db.query(CheckIn).count()
            ticket = db.query(Ticket).filter(Ticket.public_token == token).one()

        assert sorted(results) == ["ALREADY_USED", "VALID"]
        assert check_ins_count == 1
        assert ticket.status == TicketStatus.USED


def test_check_in_rejects_ticket_from_wrong_event() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            event_id, customer_id, _, organizer_id = seed_capacity_event(db, capacity=10)
            wrong_event = Event(
                organizer_id=organizer_id,
                title="Other Session",
                description="Outra sessão para validar evento errado.",
                starts_at=datetime.now(UTC) + timedelta(days=2),
                venue="Other Hall",
                capacity=10,
                price=Decimal("15.00"),
                status=EventStatus.PUBLISHED,
                published_at=datetime.now(UTC),
            )
            gate_operator = User(
                name="Gate",
                email=f"gate-{uuid4()}@example.com",
                password_hash="hash",
                role=UserRole.GATE_OPERATOR,
            )
            ticket = Ticket(
                event_id=event_id,
                customer_id=customer_id,
                seat_label="A1",
                paid_amount=Decimal("10.00"),
                status=TicketStatus.VALID,
                checkout_status=CheckoutStatus.CONFIRMED,
            )
            db.add_all([wrong_event, gate_operator, ticket])
            db.commit()

            result = check_in_ticket(db, ticket.public_token, wrong_event.id, gate_operator)

            assert result.status == "WRONG_EVENT"
            assert result.ticket_id == ticket.id
            assert db.query(CheckIn).count() == 0


def test_failed_payment_does_not_emit_ticket() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            event_id, customer_id, _, _ = seed_capacity_event(db, capacity=10)
            customer = authenticated_customer(customer_id)
            payment = create_pix_payment(db, event_id, "A1", customer)
            payment_id = payment.id

        with SessionLocal() as db:
            customer = authenticated_customer(customer_id)
            failed_payment = fail_pix_payment(db, payment_id, customer)

            assert failed_payment.status == PaymentStatus.FAILED
            assert failed_payment.ticket_id is None

        with SessionLocal() as db:
            assert db.query(Ticket).filter(Ticket.event_id == event_id).count() == 0

        with SessionLocal() as db:
            customer = authenticated_customer(customer_id)
            with pytest.raises(ConflictError):
                approve_pix_payment(db, payment_id, customer)


def test_pending_payment_reserves_seat_until_it_fails() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            event_id, first_customer_id, second_customer_id, _ = seed_capacity_event(db, capacity=10)
            first_customer = authenticated_customer(first_customer_id)
            first_payment = create_pix_payment(db, event_id, "A1", first_customer)
            first_payment_id = first_payment.id

        with SessionLocal() as db:
            second_customer = authenticated_customer(second_customer_id)
            with pytest.raises(ConflictError):
                create_pix_payment(db, event_id, "A1", second_customer)

        with SessionLocal() as db:
            first_customer = authenticated_customer(first_customer_id)
            fail_pix_payment(db, first_payment_id, first_customer)

        with SessionLocal() as db:
            second_customer = authenticated_customer(second_customer_id)
            second_payment = create_pix_payment(db, event_id, "A1", second_customer)

            assert second_payment.status == PaymentStatus.PENDING
            pending_count = db.query(Payment).filter(
                Payment.event_id == event_id,
                Payment.status == PaymentStatus.PENDING,
            ).count()
            assert pending_count == 1


def test_approved_payment_emits_ticket_and_shared_token_can_be_loaded() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            event_id, customer_id, _, _ = seed_capacity_event(db, capacity=10)
            customer = authenticated_customer(customer_id)
            payment = create_pix_payment(db, event_id, "A1", customer)
            payment_id = payment.id

        with SessionLocal() as db:
            customer = authenticated_customer(customer_id)
            ticket = approve_pix_payment(db, payment_id, customer)
            ticket_id = ticket.id
            public_token = ticket.public_token

        with SessionLocal() as db:
            shared_ticket = get_ticket_by_public_token(db, public_token)

            assert shared_ticket.id == ticket_id
            assert shared_ticket.status == TicketStatus.VALID
            assert shared_ticket.seat_label == "A1"
