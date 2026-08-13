from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import InvalidTicketError
from app.db.models import CheckIn, Event, EventStatus, Ticket, TicketStatus, User
from app.gate.schemas import GateValidationResult
from app.tickets.service import is_unique_constraint_error


def check_in_ticket(db: Session, token: str, expected_event_id: UUID, gate_operator: User) -> GateValidationResult:
    try:
        with db.begin():
            ticket = db.scalar(select(Ticket).where(Ticket.public_token == token).with_for_update())

            if ticket is None:
                raise InvalidTicketError()

            event = db.scalar(select(Event).where(Event.id == ticket.event_id))
            if event is None or event.status != EventStatus.PUBLISHED:
                raise InvalidTicketError("Este ingresso não está liberado para entrada.")

            if ticket.event_id != expected_event_id:
                return GateValidationResult(
                    status="WRONG_EVENT",
                    message="Este ingresso pertence a outra sessão.",
                    ticket_id=ticket.id,
                    checked_in_at=None,
                )

            if ticket.status == TicketStatus.USED:
                return GateValidationResult(
                    status="ALREADY_USED",
                    message="Este ingresso já foi usado.",
                    ticket_id=ticket.id,
                    checked_in_at=ticket.check_in.checked_in_at if ticket.check_in else None,
                )

            if ticket.status != TicketStatus.VALID:
                raise InvalidTicketError()

            check_in = CheckIn(ticket_id=ticket.id, gate_operator_id=gate_operator.id)
            ticket.status = TicketStatus.USED
            db.add(check_in)

        db.refresh(check_in)
        return GateValidationResult(
            status="VALID",
            message="Entrada liberada.",
            ticket_id=check_in.ticket_id,
            checked_in_at=check_in.checked_in_at,
        )
    except IntegrityError as exc:
        db.rollback()
        if is_unique_constraint_error(exc):
            return GateValidationResult(status="ALREADY_USED", message="Este ingresso já foi usado.")
        raise
