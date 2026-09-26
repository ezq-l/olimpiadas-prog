from app.models.usuario import RolUsuario, Usuario
from tests.conftest import TestingSessionLocal

PALETA_AZUL = {
    "principal": "#1c62b9",
    "exito": "#2b7a3b",
    "aviso": "#9a5b00",
    "peligro": "#c02d2d",
    "info": "#5b3cc4",
}


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _crear_otro_admin(client):
    client.post(
        "/api/v1/auth/register",
        json={"nombre": "Otro Admin", "email": "otro@kiosco.com", "password": "otro1234"},
    )
    db = TestingSessionLocal()
    usuario = db.query(Usuario).filter(Usuario.email == "otro@kiosco.com").first()
    usuario.rol = RolUsuario.ADMIN
    db.commit()
    db.close()
    login = client.post("/api/v1/auth/login", data={"username": "otro@kiosco.com", "password": "otro1234"})
    return login.json()["access_token"]


def test_preferencias_vacias_por_defecto(client, cliente_token):
    response = client.get("/api/v1/preferencias", headers=_auth(cliente_token))
    assert response.status_code == 200
    assert response.json() == {"tema": None, "paleta": None}


def test_cliente_puede_elegir_tema(client, cliente_token):
    response = client.patch("/api/v1/preferencias", json={"tema": "oscuro"}, headers=_auth(cliente_token))
    assert response.status_code == 200
    assert client.get("/api/v1/preferencias", headers=_auth(cliente_token)).json()["tema"] == "oscuro"


def test_cliente_no_puede_cambiar_paleta(client, cliente_token):
    response = client.patch("/api/v1/preferencias", json={"paleta": PALETA_AZUL}, headers=_auth(cliente_token))
    assert response.status_code == 403


def test_admin_guarda_paleta_y_cambiar_tema_no_la_borra(client, admin_token):
    client.patch("/api/v1/preferencias", json={"paleta": PALETA_AZUL}, headers=_auth(admin_token))
    client.patch("/api/v1/preferencias", json={"tema": "claro"}, headers=_auth(admin_token))

    preferencias = client.get("/api/v1/preferencias", headers=_auth(admin_token)).json()
    assert preferencias == {"tema": "claro", "paleta": PALETA_AZUL}


def test_la_paleta_de_un_admin_no_afecta_a_otro_admin(client, admin_token):
    otro_admin_token = _crear_otro_admin(client)
    client.patch("/api/v1/preferencias", json={"paleta": PALETA_AZUL}, headers=_auth(admin_token))

    preferencias_otro = client.get("/api/v1/preferencias", headers=_auth(otro_admin_token)).json()
    assert preferencias_otro["paleta"] is None


def test_admin_puede_restaurar_paleta_original(client, admin_token):
    client.patch("/api/v1/preferencias", json={"paleta": PALETA_AZUL}, headers=_auth(admin_token))
    client.patch("/api/v1/preferencias", json={"paleta": None}, headers=_auth(admin_token))
    assert client.get("/api/v1/preferencias", headers=_auth(admin_token)).json()["paleta"] is None


def test_color_invalido_rechazado(client, admin_token):
    paleta_mala = {**PALETA_AZUL, "principal": "rojo"}
    response = client.patch("/api/v1/preferencias", json={"paleta": paleta_mala}, headers=_auth(admin_token))
    assert response.status_code == 422


def test_preferencias_requieren_login(client):
    assert client.get("/api/v1/preferencias").status_code == 401
