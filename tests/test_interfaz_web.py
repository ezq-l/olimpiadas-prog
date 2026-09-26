def test_raiz_sirve_la_interfaz_web(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Kiosco Don Pepe" in response.text


def test_archivos_estaticos_disponibles(client):
    assert client.get("/static/app.js").status_code == 200
    assert client.get("/static/styles.css").status_code == 200
