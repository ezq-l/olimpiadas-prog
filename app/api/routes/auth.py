from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import Token, UsuarioCreate, UsuarioOut

router = APIRouter(prefix="/auth", tags=["Autenticacion"])


@router.post("/register", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def register(payload: UsuarioCreate, db: Session = Depends(get_db)):
    existing = db.query(Usuario).filter(Usuario.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ya existe una cuenta con ese email")

    user = Usuario(
        nombre=payload.nombre,
        email=payload.email,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(Usuario.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(subject=user.email, rol=user.rol.value)
    return Token(access_token=token)


@router.get("/me", response_model=UsuarioOut)
def me(current_user: Usuario = Depends(get_current_user)):
    return current_user
