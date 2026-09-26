from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.preferencias import Preferencias
from app.models.usuario import RolUsuario, Usuario
from app.schemas.preferencias import PreferenciasOut, PreferenciasUpdate

router = APIRouter(prefix="/preferencias", tags=["Preferencias"])


@router.get("", response_model=PreferenciasOut)
def ver_preferencias(db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    preferencias = db.get(Preferencias, usuario.id)
    if not preferencias:
        return PreferenciasOut()
    return PreferenciasOut(tema=preferencias.tema, paleta=preferencias.paleta)


@router.patch("", response_model=PreferenciasOut)
def actualizar_preferencias(
    payload: PreferenciasUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    cambios = payload.model_dump(exclude_unset=True)

    # Cualquier usuario elige su tema; la paleta de colores es solo para administradores.
    if cambios.get("paleta") is not None and usuario.rol != RolUsuario.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden cambiar la paleta de colores",
        )

    preferencias = db.get(Preferencias, usuario.id)
    if not preferencias:
        preferencias = Preferencias(usuario_id=usuario.id)
        db.add(preferencias)

    for campo, valor in cambios.items():
        setattr(preferencias, campo, valor)

    db.commit()
    return PreferenciasOut(tema=preferencias.tema, paleta=preferencias.paleta)
