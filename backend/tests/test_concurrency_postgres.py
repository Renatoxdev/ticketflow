from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from app.auth.schemas import UserCreate
from app.auth.service import register_user
from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError, SoldOutError
from app.db import Base
from app.db.models import (
    CheckIn,
    CheckoutStatus,
    Event,
    EventStatus,
    Payment,
    PaymentSeat,
    PaymentStatus,
    Ticket,
    TicketStatus,
    User,
    UserRole,
)
from app.events.schemas import EventCreate
from app.events.service import build_seat_label, create_published_event, list_available_events, list_organizer_events
from app.gate.service import check_in_ticket
from app.tickets.service import (
    approve_pix_payment,
    buy_ticket,
    create_pix_payment,
    fail_pix_payment,
    get_ticket_by_public_token,
)

TEST_DATABASE_URL = settings.database_url


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


def test_created_event_remains_visible_to_organizer_and_customer() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            _, _, _, organizer_id = seed_capacity_event(db, capacity=10)
            organizer = db.get(User, organizer_id)
            assert organizer is not None

            created = create_published_event(
                db,
                organizer,
                EventCreate(
                    title="Published Session",
                    description="Sessão criada para testar persistência e listagem.",
                    starts_at=datetime.now(UTC) + timedelta(days=3),
                    venue="Sala Persistência",
                    capacity=20,
                    price=Decimal("19.90"),
                    external_source="test",
                    external_id="published-session",
                ),
            )

        with SessionLocal() as db:
            organizer = db.get(User, organizer_id)
            assert organizer is not None
            organizer_events = list_organizer_events(db, organizer)
            customer_events = list_available_events(db)

            assert any(event.id == created.id for event in organizer_events)
            assert any(event.id == created.id for event in customer_events)


def test_event_cannot_be_created_in_the_past() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            _, _, _, organizer_id = seed_capacity_event(db, capacity=10)
            organizer = db.get(User, organizer_id)
            assert organizer is not None

            with pytest.raises(ConflictError):
                create_published_event(
                    db,
                    organizer,
                    EventCreate(
                        title="Past Session",
                        description="Sessão inválida porque já ficou no passado.",
                        starts_at=datetime.now(UTC) - timedelta(minutes=5),
                        venue="Sala Passado",
                        capacity=20,
                        price=Decimal("19.90"),
                        external_source="test",
                        external_id="past-session",
                    ),
                )


def test_event_accepts_naive_future_datetime_without_server_error() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            _, _, _, organizer_id = seed_capacity_event(db, capacity=10)
            organizer = db.get(User, organizer_id)
            assert organizer is not None

            created = create_published_event(
                db,
                organizer,
                EventCreate(
                    title="Naive Future Session",
                    description="Sessao criada com data sem timezone explicito.",
                    starts_at=datetime.now() + timedelta(days=2),
                    venue="Sala Timezone",
                    capacity=20,
                    price=Decimal("19.90"),
                    external_source="test",
                    external_id="naive-future-session",
                ),
            )

            assert created.starts_at.tzinfo is not None


def test_checkout_rejects_a_session_that_already_started() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            event_id, customer_id, _, _ = seed_capacity_event(db, capacity=10)
            event = db.get(Event, event_id)
            assert event is not None
            event.starts_at = datetime.now(UTC) - timedelta(seconds=1)
            db.commit()

        with SessionLocal() as db:
            with pytest.raises(NotFoundError, match="não está disponível"):
                create_pix_payment(db, event_id, ["A1"], authenticated_customer(customer_id))


def test_seat_labels_remain_valid_after_row_z() -> None:
    assert build_seat_label(259) == "Z10"
    assert build_seat_label(260) == "AA1"
    assert build_seat_label(269) == "AA10"


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


def test_concurrent_registration_returns_conflict_instead_of_database_error() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        email = f"concurrent-{uuid4()}@example.com"
        payload = UserCreate(name="Concurrent User", email=email, password="safe-password", role=UserRole.CUSTOMER)

        def attempt_registration() -> str:
            with SessionLocal() as db:
                try:
                    register_user(db, payload)
                    return "CREATED"
                except ConflictError:
                    return "CONFLICT"

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: attempt_registration(), range(2)))

        with SessionLocal() as db:
            users_count = db.query(User).filter(User.email == email).count()

        assert sorted(results) == ["CONFLICT", "CREATED"]
        assert users_count == 1


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
            payment = create_pix_payment(db, event_id, ["A1"], customer)
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


def test_expired_payment_failure_is_persisted() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            event_id, customer_id, _, _ = seed_capacity_event(db, capacity=10)
            customer = authenticated_customer(customer_id)
            payment = create_pix_payment(db, event_id, ["A1"], customer)
            payment.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            payment_id = payment.id
            db.commit()

        with SessionLocal() as db:
            customer = authenticated_customer(customer_id)
            with pytest.raises(ConflictError, match="expirou"):
                approve_pix_payment(db, payment_id, customer)

        with SessionLocal() as db:
            payment = db.get(Payment, payment_id)
            assert payment is not None
            assert payment.status == PaymentStatus.FAILED
            assert {seat.status for seat in payment.seats} == {PaymentStatus.FAILED}
            assert db.query(Ticket).filter(Ticket.event_id == event_id).count() == 0


def test_approve_and_fail_payment_cannot_leave_inconsistent_state() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            event_id, customer_id, _, _ = seed_capacity_event(db, capacity=10)
            payment = create_pix_payment(db, event_id, ["A1"], authenticated_customer(customer_id))
            payment_id = payment.id

        def approve() -> str:
            with SessionLocal() as db:
                try:
                    approve_pix_payment(db, payment_id, authenticated_customer(customer_id))
                    return "PAID"
                except ConflictError:
                    return "CONFLICT"

        def fail() -> str:
            with SessionLocal() as db:
                try:
                    fail_pix_payment(db, payment_id, authenticated_customer(customer_id))
                    return "FAILED"
                except ConflictError:
                    return "CONFLICT"

        with ThreadPoolExecutor(max_workers=2) as executor:
            approve_result = executor.submit(approve)
            fail_result = executor.submit(fail)
            results = {approve_result.result(), fail_result.result()}

        with SessionLocal() as db:
            payment = db.get(Payment, payment_id)
            assert payment is not None
            tickets_count = db.query(Ticket).filter(Ticket.event_id == event_id).count()

            assert results in ({"PAID", "CONFLICT"}, {"FAILED", "CONFLICT"})
            if payment.status == PaymentStatus.PAID:
                assert tickets_count == 1
                assert {seat.status for seat in payment.seats} == {PaymentStatus.PAID}
            else:
                assert payment.status == PaymentStatus.FAILED
                assert tickets_count == 0
                assert {seat.status for seat in payment.seats} == {PaymentStatus.FAILED}


def test_pending_payment_reserves_seat_until_it_fails() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            event_id, first_customer_id, second_customer_id, _ = seed_capacity_event(db, capacity=10)
            first_customer = authenticated_customer(first_customer_id)
            first_payment = create_pix_payment(db, event_id, ["A1"], first_customer)
            first_payment_id = first_payment.id

        with SessionLocal() as db:
            second_customer = authenticated_customer(second_customer_id)
            with pytest.raises(ConflictError):
                create_pix_payment(db, event_id, ["A1"], second_customer)

        with SessionLocal() as db:
            first_customer = authenticated_customer(first_customer_id)
            fail_pix_payment(db, first_payment_id, first_customer)

        with SessionLocal() as db:
            second_customer = authenticated_customer(second_customer_id)
            second_payment = create_pix_payment(db, event_id, ["A1"], second_customer)

            assert second_payment.status == PaymentStatus.PENDING
            pending_count = db.query(Payment).filter(
                Payment.event_id == event_id,
                Payment.status == PaymentStatus.PENDING,
            ).count()
            assert pending_count == 1


def test_cancelled_event_marks_pending_payments_as_failed() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            event_id, customer_id, _, organizer_id = seed_capacity_event(db, capacity=10)
            customer = authenticated_customer(customer_id)
            organizer = db.get(User, organizer_id)
            assert organizer is not None
            payment = create_pix_payment(db, event_id, ["A1"], customer)
            payment_id = payment.id

            from app.events.service import cancel_organizer_event

            cancel_organizer_event(db, event_id, organizer)

        with SessionLocal() as db:
            payment = db.get(Payment, payment_id)
            assert payment is not None
            assert payment.status == PaymentStatus.FAILED
            assert {seat.status for seat in payment.seats} == {PaymentStatus.FAILED}


def test_approved_payment_emits_ticket_and_shared_token_can_be_loaded() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            event_id, customer_id, _, _ = seed_capacity_event(db, capacity=10)
            customer = authenticated_customer(customer_id)
            payment = create_pix_payment(db, event_id, ["A1"], customer)
            payment_id = payment.id

        with SessionLocal() as db:
            customer = authenticated_customer(customer_id)
            ticket = approve_pix_payment(db, payment_id, customer)[0]
            ticket_id = ticket.id
            public_token = ticket.public_token

        with SessionLocal() as db:
            shared_ticket = get_ticket_by_public_token(db, public_token)

            assert shared_ticket.id == ticket_id
            assert shared_ticket.status == TicketStatus.VALID
            assert shared_ticket.seat_label == "A1"


def test_single_payment_emits_ticket_for_each_selected_seat() -> None:
    with isolated_postgres_sessionmaker() as SessionLocal:
        with SessionLocal() as db:
            event_id, customer_id, _, _ = seed_capacity_event(db, capacity=10)
            customer = authenticated_customer(customer_id)
            payment = create_pix_payment(db, event_id, ["A1", "A2", "A3"], customer)
            payment_id = payment.id

            assert payment.amount == Decimal("30.00")
            assert {seat.seat_label for seat in payment.seats} == {"A1", "A2", "A3"}

        with SessionLocal() as db:
            customer = authenticated_customer(customer_id)
            tickets = approve_pix_payment(db, payment_id, customer)

            assert {ticket.seat_label for ticket in tickets} == {"A1", "A2", "A3"}
            assert db.query(PaymentSeat).filter(PaymentSeat.payment_id == payment_id).count() == 3
            assert db.query(Ticket).filter(Ticket.event_id == event_id).count() == 3
