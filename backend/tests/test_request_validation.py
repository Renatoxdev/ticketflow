from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.auth.schemas import UserCreate
from app.db.models import UserRole
from app.events.schemas import EventCreate, EventUpdate


def valid_event_payload() -> dict[str, object]:
    return {
        "title": "Sessão válida",
        "description": "Descrição suficientemente longa.",
        "starts_at": datetime.now(UTC) + timedelta(days=1),
        "venue": "Sala 1",
        "capacity": 10,
        "price": Decimal("10.00"),
    }


@pytest.mark.parametrize("field,value", [("title", "  "), ("description", "          "), ("venue", "  ")])
def test_event_rejects_required_text_containing_only_spaces(field: str, value: str) -> None:
    payload = valid_event_payload()
    payload[field] = value

    with pytest.raises(ValidationError):
        EventCreate.model_validate(payload)


def test_event_update_rejects_internal_fields() -> None:
    with pytest.raises(ValidationError):
        EventUpdate.model_validate({"status": "CANCELLED", "organizer_id": "00000000-0000-0000-0000-000000000000"})


def test_user_rejects_blank_name_and_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        UserCreate.model_validate(
            {
                "name": "  ",
                "email": "qa@example.com",
                "password": "safe-password",
                "role": UserRole.CUSTOMER,
                "is_admin": True,
            }
        )
