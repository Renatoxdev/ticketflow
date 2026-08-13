from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import require_role
from app.db.models import User, UserRole
from app.db.session import get_db
from app.gate.schemas import CheckInRequest, GateValidationResult
from app.gate.service import check_in_ticket

router = APIRouter(prefix="/gate", tags=["gate"])


@router.post("/check-ins", response_model=GateValidationResult)
def check_in(
    payload: CheckInRequest,
    gate_operator: User = Depends(require_role(UserRole.GATE_OPERATOR)),
    db: Session = Depends(get_db),
) -> GateValidationResult:
    return check_in_ticket(db, payload.token, payload.event_id, gate_operator)
