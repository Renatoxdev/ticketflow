from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.auth.security import hash_password
from app.db.models import Event, EventStatus, User, UserRole
from app.db.session import SessionLocal

DEMO_ORGANIZER_EMAIL = "admin@ticketflow.com"
DEMO_EVENT_EXTERNAL_ID = "demo-ticketflow-inception"

DEMO_USERS = [
    ("Organizador Demo", DEMO_ORGANIZER_EMAIL, "admin", UserRole.ORGANIZER),
    ("Cliente Demo 1", "user1@ticketflow.com", "user1", UserRole.CUSTOMER),
    ("Cliente Demo 2", "user2@ticketflow.com", "user2", UserRole.CUSTOMER),
    ("Portaria Demo", "portaria@ticketflow.com", "portaria", UserRole.GATE_OPERATOR),
]


def seed_demo_users() -> None:
    with SessionLocal() as db:
        for name, email, password, role in DEMO_USERS:
            existing_user = db.scalar(select(User).where(User.email == email))
            if existing_user is not None:
                continue

            db.add(
                User(
                    name=name,
                    email=email,
                    password_hash=hash_password(password),
                    role=role,
                )
            )

        db.commit()


def seed_demo_event() -> None:
    with SessionLocal() as db:
        organizer = db.scalar(select(User).where(User.email == DEMO_ORGANIZER_EMAIL))
        if organizer is None:
            return

        existing_event = db.scalar(
            select(Event).where(
                Event.external_source == "seed",
                Event.external_id == DEMO_EVENT_EXTERNAL_ID,
            )
        )
        if existing_event is not None:
            return

        starts_at = datetime.now(UTC) + timedelta(days=7)
        db.add(
            Event(
                organizer_id=organizer.id,
                title="Inception",
                description=(
                    "Uma sessão demo pronta para testar vitrine, escolha de assento, pagamento simulado, "
                    "emissão de ingresso e validação na portaria."
                ),
                image_url="https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
                starts_at=starts_at,
                venue="Sala 1",
                capacity=30,
                price=Decimal("24.90"),
                status=EventStatus.PUBLISHED,
                external_source="seed",
                external_id=DEMO_EVENT_EXTERNAL_ID,
                published_at=datetime.now(UTC),
            )
        )
        db.commit()


if __name__ == "__main__":
    seed_demo_users()
    seed_demo_event()
    print("Dados demo criados ou já existentes.")
