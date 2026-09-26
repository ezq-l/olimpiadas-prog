"""Carga datos iniciales: dos usuarios administradores y productos de ejemplo.
Uso: python -m scripts.seed
"""

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.producto import Producto
from app.models.usuario import RolUsuario, Usuario

# Dos administradores para mostrar que cada uno tiene su propia paleta de colores.
ADMINISTRADORES = [
    ("Administrador", "admin@kiosco.com", "admin123"),
    ("Segundo Administrador", "admin2@kiosco.com", "admin123"),
]


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for nombre, email, password in ADMINISTRADORES:
            if not db.query(Usuario).filter(Usuario.email == email).first():
                db.add(
                    Usuario(
                        nombre=nombre,
                        email=email,
                        hashed_password=hash_password(password),
                        rol=RolUsuario.ADMIN,
                    )
                )

        if db.query(Producto).count() == 0:
            productos = [
                Producto(nombre="Coca Cola 500ml", descripcion="Gaseosa", precio=1500, stock=50),
                Producto(nombre="Alfajor Jorgito", descripcion="Alfajor de chocolate", precio=900, stock=100),
                Producto(nombre="Papas Fritas Lays", descripcion="Snack salado", precio=2200, stock=30),
            ]
            db.add_all(productos)

        db.commit()
        print("Seed completado: admin@kiosco.com y admin2@kiosco.com (clave: admin123)")
    finally:
        db.close()


if __name__ == "__main__":
    run()
