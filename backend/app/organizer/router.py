from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.auth.dependencies import require_role
from app.db.models import User, UserRole
from app.db.session import get_db
from app.events.schemas import EventCreate, EventRead, EventUpdate
from app.events.service import (
    cancel_organizer_event,
    create_published_event,
    delete_cancelled_organizer_event,
    list_organizer_events,
    update_organizer_event,
)
from app.external.schemas import ExternalCatalogItem
from app.external.tmdb import search_movies

router = APIRouter(prefix="/organizer", tags=["organizer"])


@router.get("/external-catalog", response_model=list[ExternalCatalogItem])
async def search_external_catalog(
    q: str,
    _: User = Depends(require_role(UserRole.ORGANIZER)),
) -> list[ExternalCatalogItem]:
    return await search_movies(q)


@router.post("/events", response_model=EventRead, status_code=201)
def create_event(
    payload: EventCreate,
    organizer: User = Depends(require_role(UserRole.ORGANIZER)),
    db: Session = Depends(get_db),
) -> EventRead:
    return create_published_event(db, organizer, payload)


@router.get("/events", response_model=list[EventRead])
def list_events_for_organizer(
    organizer: User = Depends(require_role(UserRole.ORGANIZER)),
    db: Session = Depends(get_db),
) -> list[EventRead]:
    return list_organizer_events(db, organizer)


@router.patch("/events/{event_id}", response_model=EventRead)
def update_event(
    event_id: UUID,
    payload: EventUpdate,
    organizer: User = Depends(require_role(UserRole.ORGANIZER)),
    db: Session = Depends(get_db),
) -> EventRead:
    return update_organizer_event(db, event_id, organizer, payload)


@router.post("/events/{event_id}/cancel", response_model=EventRead)
def cancel_event(
    event_id: UUID,
    organizer: User = Depends(require_role(UserRole.ORGANIZER)),
    db: Session = Depends(get_db),
) -> EventRead:
    return cancel_organizer_event(db, event_id, organizer)


@router.delete("/events/{event_id}", status_code=204)
def delete_event(
    event_id: UUID,
    organizer: User = Depends(require_role(UserRole.ORGANIZER)),
    db: Session = Depends(get_db),
) -> Response:
    delete_cancelled_organizer_event(db, event_id, organizer)
    return Response(status_code=204)
