from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.pedido import DetallePedido
from app.models.producto import Producto
from app.schemas.producto import ProductoCreate, ProductoOut, ProductoUpdate

router = APIRouter(prefix="/productos", tags=["Productos"])


@router.get("", response_model=list[ProductoOut])
def listar_productos(db: Session = Depends(get_db)):
    return db.query(Producto).all()


@router.get("/{producto_id}", response_model=ProductoOut)
def obtener_producto(producto_id: int, db: Session = Depends(get_db)):
    producto = db.get(Producto, producto_id)
    if not producto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    return producto


@router.post("", response_model=ProductoOut, status_code=status.HTTP_201_CREATED)
def crear_producto(
    payload: ProductoCreate, db: Session = Depends(get_db), _admin=Depends(get_current_admin)
):
    producto = Producto(**payload.model_dump())
    db.add(producto)
    db.commit()
    db.refresh(producto)
    return producto


@router.put("/{producto_id}", response_model=ProductoOut)
def actualizar_producto(
    producto_id: int,
    payload: ProductoUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    producto = db.get(Producto, producto_id)
    if not producto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(producto, field, value)

    db.commit()
    db.refresh(producto)
    return producto


@router.delete("/{producto_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_producto(
    producto_id: int, db: Session = Depends(get_db), _admin=Depends(get_current_admin)
):
    producto = db.get(Producto, producto_id)
    if not producto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")

    # Integridad referencial: no se borra un producto que ya figura en pedidos.
    tiene_pedidos = db.query(DetallePedido.id).filter(DetallePedido.producto_id == producto_id).first()
    if tiene_pedidos:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar el producto porque tiene pedidos asociados. Poné su stock en 0 para dejar de venderlo.",
        )

    db.delete(producto)
    db.commit()
