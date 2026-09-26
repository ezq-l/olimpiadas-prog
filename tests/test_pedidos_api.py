import httpx
import respx


def _mock_geocoding():
    return respx.get("https://nominatim.openstreetmap.org/search").mock(
        side_effect=[
            httpx.Response(200, json=[{"lat": "-34.6534", "lon": "-58.6198"}]),
            httpx.Response(200, json=[{"lat": "-34.6037", "lon": "-58.3816"}]),
        ]
    )


def _crear_producto(client, admin_token, stock=10):
    response = client.post(
        "/api/v1/productos",
        json={"nombre": "Alfajor Jorgito", "precio": 900, "stock": stock},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    return response.json()["id"]


@respx.mock
def test_crear_pedido_descuenta_stock_y_calcula_envio(client, admin_token, cliente_token):
    _mock_geocoding()
    producto_id = _crear_producto(client, admin_token, stock=10)

    response = client.post(
        "/api/v1/pedidos",
        json={
            "direccion_envio": "Av. 9 de Julio 1, CABA, Argentina",
            "items": [{"producto_id": producto_id, "cantidad": 3}],
        },
        headers={"Authorization": f"Bearer {cliente_token}"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["estado"] == "pendiente"
    assert body["costo_envio"] > 0
    assert body["total"] > body["costo_envio"]
    assert len(body["detalles"]) == 1
    assert body["detalles"][0]["cantidad"] == 3

    producto = client.get(f"/api/v1/productos/{producto_id}").json()
    assert producto["stock"] == 7


@respx.mock
def test_crear_pedido_sin_stock_falla(client, admin_token, cliente_token):
    _mock_geocoding()
    producto_id = _crear_producto(client, admin_token, stock=1)

    response = client.post(
        "/api/v1/pedidos",
        json={
            "direccion_envio": "Av. 9 de Julio 1, CABA, Argentina",
            "items": [{"producto_id": producto_id, "cantidad": 5}],
        },
        headers={"Authorization": f"Bearer {cliente_token}"},
    )
    assert response.status_code == 400


def test_crear_pedido_sin_autenticacion_falla(client):
    response = client.post(
        "/api/v1/pedidos",
        json={"direccion_envio": "Direccion X", "items": [{"producto_id": 1, "cantidad": 1}]},
    )
    assert response.status_code == 401


@respx.mock
def test_cliente_no_puede_ver_pedido_de_otro_usuario(client, admin_token, cliente_token):
    _mock_geocoding()
    producto_id = _crear_producto(client, admin_token, stock=10)

    pedido = client.post(
        "/api/v1/pedidos",
        json={
            "direccion_envio": "Av. 9 de Julio 1, CABA, Argentina",
            "items": [{"producto_id": producto_id, "cantidad": 1}],
        },
        headers={"Authorization": f"Bearer {cliente_token}"},
    ).json()

    client.post(
        "/api/v1/auth/register",
        json={"nombre": "Otro Cliente", "email": "otro@kiosco.com", "password": "otro12345"},
    )
    login_otro = client.post(
        "/api/v1/auth/login", data={"username": "otro@kiosco.com", "password": "otro12345"}
    )
    token_otro = login_otro.json()["access_token"]

    response = client.get(
        f"/api/v1/pedidos/{pedido['id']}", headers={"Authorization": f"Bearer {token_otro}"}
    )
    assert response.status_code == 403


@respx.mock
def test_admin_actualiza_estado_pedido(client, admin_token, cliente_token):
    _mock_geocoding()
    producto_id = _crear_producto(client, admin_token, stock=10)

    pedido = client.post(
        "/api/v1/pedidos",
        json={
            "direccion_envio": "Av. 9 de Julio 1, CABA, Argentina",
            "items": [{"producto_id": producto_id, "cantidad": 1}],
        },
        headers={"Authorization": f"Bearer {cliente_token}"},
    ).json()

    response = client.patch(
        f"/api/v1/pedidos/{pedido['id']}/estado",
        json={"estado": "confirmado"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    assert response.json()["estado"] == "confirmado"


@respx.mock
def test_no_se_puede_eliminar_producto_con_pedidos(client, admin_token, cliente_token):
    _mock_geocoding()
    producto_id = _crear_producto(client, admin_token, stock=10)
    client.post(
        "/api/v1/pedidos",
        json={
            "direccion_envio": "Av. 9 de Julio 1, CABA, Argentina",
            "items": [{"producto_id": producto_id, "cantidad": 1}],
        },
        headers={"Authorization": f"Bearer {cliente_token}"},
    )

    response = client.delete(
        f"/api/v1/productos/{producto_id}", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 409
    assert client.get(f"/api/v1/productos/{producto_id}").status_code == 200
