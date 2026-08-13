from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import require_role
from app.db.models import User, UserRole
from app.db.session import get_db
from app.tickets.schemas import (
    CheckoutCreate,
    CustomerTicketRead,
    PaymentCreate,
    PaymentRead,
    TicketListRead,
    TicketRead,
    TicketShare,
)
from app.tickets.service import (
    approve_pix_payment,
    buy_ticket,
    cancel_customer_ticket,
    create_pix_payment,
    fail_pix_payment,
    get_customer_ticket,
    get_ticket_by_public_token,
    list_customer_tickets,
)

router = APIRouter(tags=["tickets"])


@router.post("/checkout", response_model=TicketRead, status_code=201)
def checkout(
    payload: CheckoutCreate,
    customer: User = Depends(require_role(UserRole.CUSTOMER)),
    db: Session = Depends(get_db),
) -> TicketRead:
    return buy_ticket(db, payload.event_id, payload.seat_label, customer)


@router.post("/payments/pix", response_model=PaymentRead, status_code=201)
def create_payment(
    payload: PaymentCreate,
    customer: User = Depends(require_role(UserRole.CUSTOMER)),
    db: Session = Depends(get_db),
) -> PaymentRead:
    seat_labels = payload.seat_labels or ([payload.seat_label] if payload.seat_label else [])
    return PaymentRead.from_payment(create_pix_payment(db, payload.event_id, seat_labels, customer))


@router.post("/payments/{payment_id}/approve", response_model=TicketListRead)
def approve_payment(
    payment_id: UUID,
    customer: User = Depends(require_role(UserRole.CUSTOMER)),
    db: Session = Depends(get_db),
) -> TicketListRead:
    return TicketListRead(tickets=approve_pix_payment(db, payment_id, customer))


@router.post("/payments/{payment_id}/fail", response_model=PaymentRead)
def fail_payment(
    payment_id: UUID,
    customer: User = Depends(require_role(UserRole.CUSTOMER)),
    db: Session = Depends(get_db),
) -> PaymentRead:
    return PaymentRead.from_payment(fail_pix_payment(db, payment_id, customer))


@router.get("/customer/tickets", response_model=list[CustomerTicketRead])
def list_tickets(
    customer: User = Depends(require_role(UserRole.CUSTOMER)),
    db: Session = Depends(get_db),
) -> list[CustomerTicketRead]:
    return [
        CustomerTicketRead(
            ticket_id=ticket.id,
            event_id=ticket.event_id,
            title=ticket.event.title,
            image_url=ticket.event.image_url,
            starts_at=ticket.event.starts_at,
            venue=ticket.event.venue,
            seat_label=ticket.seat_label,
            token=ticket.public_token,
            qr_payload=ticket.public_token,
            status=ticket.status,
            paid_amount=ticket.paid_amount,
        )
        for ticket in list_customer_tickets(db, customer)
    ]


@router.post("/customer/tickets/{ticket_id}/cancel", response_model=TicketRead)
def cancel_ticket(
    ticket_id: UUID,
    customer: User = Depends(require_role(UserRole.CUSTOMER)),
    db: Session = Depends(get_db),
) -> TicketRead:
    return cancel_customer_ticket(db, ticket_id, customer)


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
