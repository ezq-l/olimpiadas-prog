import os
from functools import lru_cache

from dotenv import load_dotenv

# Carga las variables del archivo .env (si existe). No pisa las variables que ya
# esten definidas en el entorno (Docker Compose, CI, etc.).
load_dotenv()


class Settings:
    PROJECT_NAME: str = "Kiosco Don Pepe API"
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://kiosco:kiosco@db:5432/kiosco_don_pepe",
    )

    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

    KIOSCO_ORIGIN_ADDRESS: str = os.getenv(
        "KIOSCO_ORIGIN_ADDRESS", "Av. Rivadavia 1000, Moron, Buenos Aires, Argentina"
    )
    GEOCODING_BASE_URL: str = os.getenv(
        "GEOCODING_BASE_URL", "https://nominatim.openstreetmap.org/search"
    )
    ENVIO_COSTO_POR_KM: float = float(os.getenv("ENVIO_COSTO_POR_KM", "150.0"))
    ENVIO_COSTO_BASE: float = float(os.getenv("ENVIO_COSTO_BASE", "500.0"))

    CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "*").split(",")


@lru_cache
def get_settings() -> Settings:
    return Settings()
