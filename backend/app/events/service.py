from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Event, EventStatus, User
from app.events.schemas import EventCreate


def create_published_event(db: Session, organizer: User, data: EventCreate) -> Event:
    event = Event(
        organizer_id=organizer.id,
        title=data.title,
        description=data.description,
        image_url=str(data.image_url) if data.image_url else None,
        starts_at=data.starts_at,
        venue=data.venue,
        capacity=data.capacity,
        price=data.price,
        status=EventStatus.PUBLISHED,
        external_source=data.external_source,
        external_id=data.external_id,
        published_at=datetime.now(UTC),
    )

    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_available_events(db: Session) -> list[Event]:
    statement = (
        select(Event)
        .where(Event.status == EventStatus.PUBLISHED, Event.starts_at >= datetime.now(UTC))
        .order_by(Event.starts_at.asc())
    )
    return list(db.scalars(statement))


def get_event_for_organizer(db: Session, event_id: UUID, organizer: User) -> Event | None:
    statement = select(Event).where(Event.id == event_id, Event.organizer_id == organizer.id)
    return db.scalar(statement)
