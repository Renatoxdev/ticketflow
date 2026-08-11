from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import require_role
from app.db.models import User, UserRole
from app.db.session import get_db
from app.tickets.schemas import CheckoutCreate, TicketRead, TicketShare
from app.tickets.service import buy_ticket, get_customer_ticket, get_ticket_by_public_token

router = APIRouter(tags=["tickets"])


@router.post("/checkout", response_model=TicketRead, status_code=201)
def checkout(
    payload: CheckoutCreate,
    customer: User = Depends(require_role(UserRole.CUSTOMER)),
    db: Session = Depends(get_db),
) -> TicketRead:
    return buy_ticket(db, payload.event_id, customer)


@router.get("/customer/tickets/{ticket_id}/qr", response_model=TicketShare)
def get_ticket_qr_payload(
    ticket_id: UUID,
    customer: User = Depends(require_role(UserRole.CUSTOMER)),
    db: Session = Depends(get_db),
) -> TicketShare:
    ticket = get_customer_ticket(db, ticket_id, customer)
    return TicketShare.from_ticket(ticket)


@router.get("/tickets/share/{token}", response_model=TicketShare)
def get_shared_ticket(token: str, db: Session = Depends(get_db)) -> TicketShare:
    ticket = get_ticket_by_public_token(db, token)
    return TicketShare.from_ticket(ticket)
