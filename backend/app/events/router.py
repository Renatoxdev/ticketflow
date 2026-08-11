from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.events.schemas import EventRead
from app.events.service import list_available_events

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventRead])
def list_events(db: Session = Depends(get_db)) -> list[EventRead]:
    return list_available_events(db)
