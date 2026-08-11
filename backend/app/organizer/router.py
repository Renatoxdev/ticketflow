from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import require_role
from app.db.models import User, UserRole
from app.db.session import get_db
from app.events.schemas import EventCreate, EventRead
from app.events.service import create_published_event
from app.external.schemas import ExternalCatalogItem
from app.external.tvmaze import search_shows

router = APIRouter(prefix="/organizer", tags=["organizer"])


@router.get("/external-catalog", response_model=list[ExternalCatalogItem])
async def search_external_catalog(
    q: str,
    _: User = Depends(require_role(UserRole.ORGANIZER)),
) -> list[ExternalCatalogItem]:
    return await search_shows(q)


@router.post("/events", response_model=EventRead, status_code=201)
def create_event(
    payload: EventCreate,
    organizer: User = Depends(require_role(UserRole.ORGANIZER)),
    db: Session = Depends(get_db),
) -> EventRead:
    return create_published_event(db, organizer, payload)
