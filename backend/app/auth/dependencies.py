from collections.abc import Callable
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import settings
from app.core.errors import ForbiddenError
from app.db.models import User, UserRole
from app.db.session import SessionLocal

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User:
    if credentials is None:
        raise ForbiddenError("Autenticação obrigatória.")

    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ForbiddenError("Token de acesso inválido.") from exc

    subject = payload.get("sub")
    if not subject:
        raise ForbiddenError("Token de acesso inválido.")

    try:
        user_id = UUID(subject)
    except ValueError as exc:
        raise ForbiddenError("Token de acesso inválido.") from exc

    with SessionLocal() as db:
        user = db.get(User, user_id)

    if user is None:
        raise ForbiddenError("Usuário não encontrado.")

    return user


def require_role(role: UserRole) -> Callable[[User], User]:
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != role:
            raise ForbiddenError("Seu perfil não permite esta operação.")
        return current_user

    return dependency
