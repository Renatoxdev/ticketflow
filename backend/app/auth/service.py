from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.schemas import LoginRequest, UserCreate
from app.auth.security import create_access_token, hash_password, verify_password
from app.core.errors import ConflictError, ForbiddenError
from app.db.models import User


def register_user(db: Session, data: UserCreate) -> User:
    existing_user = db.scalar(select(User).where(User.email == data.email))
    if existing_user is not None:
        raise ConflictError("Já existe usuário com este email.")

    user = User(
        name=data.name,
        email=str(data.email),
        password_hash=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login_user(db: Session, data: LoginRequest) -> tuple[str, User]:
    user = db.scalar(select(User).where(User.email == data.email))
    if user is None or not verify_password(data.password, user.password_hash):
        raise ForbiddenError("Email ou senha inválidos.")

    return create_access_token(str(user.id), {"role": user.role.value}), user
