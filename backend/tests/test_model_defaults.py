from app.db.models import (
    CheckoutStatus,
    Event,
    EventStatus,
    Ticket,
    TicketStatus,
    User,
    UserRole,
    generate_public_token,
)


def test_public_ticket_token_is_not_short_or_reused() -> None:
    first_token = generate_public_token()
    second_token = generate_public_token()

    assert len(first_token) >= 32
    assert first_token != second_token


def test_domain_enums_match_approved_adr_states() -> None:
    assert {role.value for role in UserRole} == {"ORGANIZER", "CUSTOMER", "GATE_OPERATOR"}
    assert {status.value for status in EventStatus} == {"DRAFT", "PUBLISHED"}
    assert {status.value for status in TicketStatus} == {"VALID", "USED"}
    assert {status.value for status in CheckoutStatus} == {"CONFIRMED"}


def test_core_tables_are_declared() -> None:
    assert User.__tablename__ == "users"
    assert Event.__tablename__ == "events"
    assert Ticket.__tablename__ == "tickets"
