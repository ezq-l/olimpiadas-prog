from typing import Annotated, Literal

from pydantic import BaseModel, Field

# Un color en formato hexadecimal, por ejemplo "#d9480f"
ColorHex = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]


class Paleta(BaseModel):
    principal: ColorHex  # botones, links y pestañas
    exito: ColorHex      # stock disponible, pedidos entregados
    aviso: ColorHex      # poco stock, pedidos pendientes
    peligro: ColorHex    # errores, sin stock, eliminar
    info: ColorHex       # pedidos confirmados o en camino


class PreferenciasOut(BaseModel):
    tema: Literal["claro", "oscuro"] | None = None
    paleta: Paleta | None = None


class PreferenciasUpdate(BaseModel):
    """Solo se modifican los campos que se envian."""

    tema: Literal["claro", "oscuro"] | None = None
    paleta: Paleta | None = None
