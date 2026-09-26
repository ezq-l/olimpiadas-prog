from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Preferencias(Base):
    """Apariencia elegida por cada usuario (una fila por usuario)."""

    __tablename__ = "preferencias"

    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), primary_key=True)
    # "claro" u "oscuro"; None = todavia no eligio
    tema: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Colores personalizados (solo administradores); None = paleta original
    paleta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
