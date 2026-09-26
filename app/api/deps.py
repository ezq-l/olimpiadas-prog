from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.usuario import RolUsuario, Usuario

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> Usuario:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Tu sesión no es válida o expiró. Ingresá de nuevo.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
    except ValueError as exc:
        raise credentials_exception from exc

    email = payload.get("sub")
    if email is None:
        raise credentials_exception

    user = db.query(Usuario).filter(Usuario.email == email).first()
    if user is None:
        raise credentials_exception
    return user


def get_current_admin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if current_user.rol != RolUsuario.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requieren permisos de administrador",
        )
    return current_user
