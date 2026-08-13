from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.events.schemas import EventRead, SeatRead
from app.events.service import list_available_events, list_event_seats

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventRead])
def list_events(
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    max_price: float | None = None,
    db: Session = Depends(get_db),
) -> list[EventRead]:
    return list_available_events(db, q=q, date_from=date_from, date_to=date_to, max_price=max_price)


@router.get("/{event_id}/seats", response_model=list[SeatRead])
def list_seats(event_id: UUID, db: Session = Depends(get_db)) -> list[SeatRead]:
    return list_event_seats(db, event_id)
