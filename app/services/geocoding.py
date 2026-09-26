"""Integracion con el servicio externo de mapas (Nominatim / OpenStreetMap)
para geocodificar direcciones y calcular la distancia de envio."""

import math

import httpx

from app.core.config import get_settings

settings = get_settings()


class GeocodingError(Exception):
    pass


def geocode_address(address: str) -> tuple[float, float]:
    """Devuelve (latitud, longitud) para una direccion usando Nominatim."""
    try:
        response = httpx.get(
            settings.GEOCODING_BASE_URL,
            params={"q": address, "format": "json", "limit": 1},
            headers={"User-Agent": "kiosco-don-pepe-api/1.0 (proyecto educativo)"},
            timeout=10.0,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise GeocodingError("No se pudo contactar el servicio de mapas. Intentá de nuevo en unos segundos.") from exc

    data = response.json()
    if not data:
        raise GeocodingError(f"No encontramos la dirección '{address}' en el mapa. Revisala e incluí localidad y provincia.")

    return float(data[0]["lat"]), float(data[0]["lon"])


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia en linea recta (km) entre dos coordenadas usando la formula de Haversine."""
    radio_tierra_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radio_tierra_km * c


def cotizar_envio(direccion_destino: str) -> dict:
    """Geocodifica origen (kiosco) y destino, calcula distancia y costo de envio."""
    lat_origen, lon_origen = geocode_address(settings.KIOSCO_ORIGIN_ADDRESS)
    lat_destino, lon_destino = geocode_address(direccion_destino)

    distancia_km = round(haversine_km(lat_origen, lon_origen, lat_destino, lon_destino), 2)
    costo = round(settings.ENVIO_COSTO_BASE + distancia_km * settings.ENVIO_COSTO_POR_KM, 2)

    return {
        "origen": settings.KIOSCO_ORIGIN_ADDRESS,
        "destino": direccion_destino,
        "distancia_km": distancia_km,
        "costo_envio": costo,
    }
