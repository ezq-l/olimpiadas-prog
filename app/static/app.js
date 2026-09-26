// =====================================================================
//  Kiosco Don Pepe - Interfaz web
//  Muestra las pantallas y se comunica con la API REST (/api/v1).
// =====================================================================


// ---------------------------------------------------------------------
// 1. DATOS EN MEMORIA
// ---------------------------------------------------------------------
let token = localStorage.getItem("token");  // JWT que devuelve el login
let usuario = null;                           // { id, nombre, email, rol }
let productos = [];                           // catálogo que viene de la API
let carrito = leerCarritoGuardado();          // [{ id, cantidad }]
let cotizacion = null;                        // { direccion, distancia_km, costo_envio }
let pedidosAdmin = [];                        // todos los pedidos (solo admin)
let productoEditando = null;                  // producto abierto en el formulario del admin
let preferencias = { tema: null, paleta: null };  // apariencia guardada en la cuenta del usuario

const ESTADOS = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};


// ---------------------------------------------------------------------
// 2. FUNCIONES DE AYUDA
// ---------------------------------------------------------------------
function $(selector) {
  return document.querySelector(selector);
}

// Formatea un número como pesos: 1500 -> "$ 1.500,00"
function pesos(numero) {
  return "$ " + Number(numero).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// La API guarda las fechas en hora UTC; se muestran en la hora de la PC.
function formatearFecha(texto) {
  return new Date(texto + "Z").toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
}

// Evita que un texto cargado por un usuario se interprete como HTML.
function textoSeguro(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

function buscarProducto(id) {
  return productos.find((p) => p.id === id);
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Muestra un mensaje flotante abajo de la pantalla durante unos segundos.
function mostrarMensaje(texto, tipo = "ok") {
  const mensaje = document.createElement("div");
  mensaje.className = "mensaje mensaje-" + tipo;
  mensaje.textContent = texto;
  $("#mensajes").append(mensaje);
  setTimeout(() => mensaje.remove(), 4000);
}

// Muestra (o esconde, si el texto está vacío) el cartel de error de un formulario.
function mostrarError(formulario, texto) {
  const alerta = formulario.querySelector(".alerta");
  alerta.textContent = texto;
  alerta.hidden = !texto;
}

// Desactiva el botón mientras se espera la respuesta de la API.
async function conBotonCargando(boton, tarea) {
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Cargando…";
  try {
    await tarea();
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}


// ---------------------------------------------------------------------
// 3. COMUNICACIÓN CON LA API
// ---------------------------------------------------------------------
// Hace un pedido a la API y devuelve la respuesta en JSON.
// Si la API responde con error, lanza un Error con un mensaje para el usuario.
async function api(ruta, { metodo = "GET", datos = null, formulario = null } = {}) {
  const opciones = { method: metodo, headers: {} };

  if (token) {
    opciones.headers["Authorization"] = "Bearer " + token;
  }
  if (datos) {
    opciones.headers["Content-Type"] = "application/json";
    opciones.body = JSON.stringify(datos);
  }
  if (formulario) {
    opciones.body = new URLSearchParams(formulario);  // el login usa formato de formulario (OAuth2)
  }

  let respuesta;
  try {
    respuesta = await fetch("/api/v1" + ruta, opciones);
  } catch {
    throw new Error("No se pudo conectar con el servidor. ¿Está encendida la API?");
  }

  if (respuesta.status === 204) return null;  // 204 = OK sin contenido (ej: al eliminar)
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (respuesta.ok) return cuerpo;

  // Si el token venció, se cierra la sesión.
  if (respuesta.status === 401 && token) {
    cerrarSesion();
  }
  if (typeof cuerpo.detail === "string") {
    throw new Error(cuerpo.detail);
  }
  if (respuesta.status === 422) {
    throw new Error("Hay datos inválidos. Revisá el formulario.");
  }
  throw new Error("Ocurrió un error en el servidor. Intentá de nuevo.");
}


// ---------------------------------------------------------------------
// 4. NAVEGACIÓN ENTRE PANTALLAS
// La pantalla actual se indica en la URL: #/catalogo, #/pedidos, #/admin, #/ingresar
// ---------------------------------------------------------------------
async function mostrarPantalla() {
  let pantalla = location.hash.replace("#/", "") || "catalogo";

  // Reglas de acceso
  if (!["catalogo", "pedidos", "admin", "ingresar"].includes(pantalla)) pantalla = "catalogo";
  if ((pantalla === "pedidos" || pantalla === "admin") && !usuario) pantalla = "ingresar";
  if (pantalla === "admin" && usuario.rol !== "admin") pantalla = "catalogo";
  if (pantalla === "ingresar" && usuario) pantalla = "catalogo";

  // Si un admin probó colores en "Apariencia" y no los guardó, se descartan al cambiar de pantalla.
  if (usuario && usuario.rol === "admin") aplicarPaleta(preferencias.paleta);

  // Se muestra solo la sección elegida y se marca el link activo
  document.querySelectorAll(".vista").forEach((seccion) => {
    seccion.hidden = seccion.id !== "vista-" + pantalla;
  });
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("activo", link.dataset.nav === pantalla);
  });

  if (pantalla === "catalogo") await cargarCatalogo();
  if (pantalla === "pedidos") await cargarMisPedidos();
  if (pantalla === "admin") await cargarAdmin();
}

function irA(pantalla) {
  if (location.hash === "#/" + pantalla) mostrarPantalla();
  else location.hash = "#/" + pantalla;  // esto dispara el evento "hashchange"
}

// Actualiza la barra superior según haya o no un usuario logueado.
function dibujarBarra() {
  $("#nav-pedidos").hidden = !usuario;
  $("#nav-admin").hidden = !usuario || usuario.rol !== "admin";
  $("#usuario-logueado").hidden = !usuario;
  $("#btn-ingresar").hidden = Boolean(usuario);
  if (usuario) {
    $("#usuario-nombre").textContent = usuario.nombre + (usuario.rol === "admin" ? " (admin)" : "");
  }
}


// ---------------------------------------------------------------------
// 5. SESIÓN: LOGIN, REGISTRO Y SALIR
// ---------------------------------------------------------------------
async function iniciarSesion(email, password) {
  const respuesta = await api("/auth/login", { metodo: "POST", formulario: { username: email, password } });
  token = respuesta.access_token;
  localStorage.setItem("token", token);
  usuario = await api("/auth/me");
  await cargarPreferencias();
  dibujarBarra();
  dibujarCarrito();
}

function cerrarSesion() {
  token = null;
  usuario = null;
  cotizacion = null;
  preferencias = { tema: null, paleta: null };
  aplicarPaleta(null);  // la paleta del admin no queda aplicada para el próximo que use la PC
  localStorage.removeItem("token");
  dibujarBarra();
  dibujarCarrito();
  irA("catalogo");
}

// Alterna entre el formulario de "Ingresar" y el de "Crear cuenta".
function mostrarFormularioAcceso(cual) {
  $("#form-login").hidden = cual !== "login";
  $("#form-registro").hidden = cual !== "registro";
  $("#pestana-login").classList.toggle("activa", cual === "login");
  $("#pestana-registro").classList.toggle("activa", cual === "registro");
}

async function enviarLogin(evento) {
  evento.preventDefault();
  const form = evento.target;
  const email = form.email.value.trim();
  const password = form.password.value;

  if (!emailValido(email)) return mostrarError(form, "Ingresá un email válido (ej: nombre@correo.com).");
  if (!password) return mostrarError(form, "Ingresá tu contraseña.");
  mostrarError(form, "");

  await conBotonCargando(form.querySelector("button"), async () => {
    try {
      await iniciarSesion(email, password);
      form.reset();
      mostrarMensaje("¡Hola, " + usuario.nombre + "!");
      irA("catalogo");
    } catch (error) {
      mostrarError(form, error.message);
    }
  });
}

async function enviarRegistro(evento) {
  evento.preventDefault();
  const form = evento.target;
  const nombre = form.nombre.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;

  if (nombre.length < 2) return mostrarError(form, "Ingresá tu nombre (mínimo 2 letras).");
  if (!emailValido(email)) return mostrarError(form, "Ingresá un email válido (ej: nombre@correo.com).");
  if (password.length < 6) return mostrarError(form, "La contraseña debe tener al menos 6 caracteres.");
  if (password !== form.confirmar.value) return mostrarError(form, "Las contraseñas no coinciden.");
  mostrarError(form, "");

  await conBotonCargando(form.querySelector("button"), async () => {
    try {
      await api("/auth/register", { metodo: "POST", datos: { nombre, email, password } });
      await iniciarSesion(email, password);
      form.reset();
      mostrarMensaje("¡Cuenta creada! Bienvenido, " + usuario.nombre + ".");
      irA("catalogo");
    } catch (error) {
      mostrarError(form, error.message);
    }
  });
}


// ---------------------------------------------------------------------
// 6. CATÁLOGO
// ---------------------------------------------------------------------
async function cargarProductos() {
  productos = await api("/productos");
  ajustarCarritoAlStock();
}

async function cargarCatalogo() {
  try {
    await cargarProductos();
    dibujarCatalogo();
  } catch (error) {
    $("#grilla-productos").innerHTML = `<p class="vacio">No se pudieron cargar los productos. ${error.message}</p>`;
  }
}

function dibujarCatalogo() {
  const busqueda = $("#buscar").value.trim().toLowerCase();
  const orden = $("#ordenar").value;

  const lista = productos.filter((p) => p.nombre.toLowerCase().includes(busqueda));
  if (orden === "precio-menor") lista.sort((a, b) => a.precio - b.precio);
  else if (orden === "precio-mayor") lista.sort((a, b) => b.precio - a.precio);
  else lista.sort((a, b) => a.nombre.localeCompare(b.nombre));

  if (lista.length === 0) {
    $("#grilla-productos").innerHTML = '<p class="vacio">No hay productos para mostrar.</p>';
    return;
  }
  $("#grilla-productos").innerHTML = lista.map(tarjetaDeProducto).join("");
}

function tarjetaDeProducto(producto) {
  const disponibles = producto.stock - cantidadEnCarrito(producto.id);

  let etiquetaStock = "Stock: " + producto.stock;
  let claseStock = "";
  if (producto.stock === 0) {
    etiquetaStock = "Sin stock";
    claseStock = "sin-stock";
  } else if (producto.stock <= 5) {
    etiquetaStock = "¡Quedan " + producto.stock + "!";
    claseStock = "poco-stock";
  }

  let textoBoton = "Agregar al carrito";
  if (producto.stock > 0 && disponibles <= 0) textoBoton = "Ya está todo en tu carrito";

  return `
    <article class="producto">
      <div class="producto-letra" style="--tono: ${(producto.id * 47) % 360}">${textoSeguro(producto.nombre[0])}</div>
      <h3>${textoSeguro(producto.nombre)}</h3>
      <p class="descripcion">${textoSeguro(producto.descripcion || "Sin descripción")}</p>
      <p class="producto-pie">
        <span class="precio">${pesos(producto.precio)}</span>
        <span class="stock ${claseStock}">${etiquetaStock}</span>
      </p>
      <button class="btn btn-primario btn-ancho" onclick="agregarAlCarrito(${producto.id})" ${disponibles <= 0 ? "disabled" : ""}>
        ${textoBoton}
      </button>
    </article>`;
}


// ---------------------------------------------------------------------
// 7. CARRITO
// Se guarda en el navegador (localStorage) para no perderlo al recargar.
// ---------------------------------------------------------------------
function leerCarritoGuardado() {
  try {
    return JSON.parse(localStorage.getItem("carrito")) || [];
  } catch {
    return [];
  }
}

function guardarCarrito() {
  localStorage.setItem("carrito", JSON.stringify(carrito));
  dibujarCarrito();
  dibujarCatalogo();
}

function cantidadEnCarrito(id) {
  const item = carrito.find((i) => i.id === id);
  return item ? item.cantidad : 0;
}

function agregarAlCarrito(id) {
  const item = carrito.find((i) => i.id === id);
  if (item) item.cantidad++;
  else carrito.push({ id: id, cantidad: 1 });
  guardarCarrito();
  mostrarMensaje("Agregaste " + buscarProducto(id).nombre + " al carrito.");
}

// cambio = +1 o -1
function cambiarCantidad(id, cambio) {
  const item = carrito.find((i) => i.id === id);
  const producto = buscarProducto(id);
  const nuevaCantidad = item.cantidad + cambio;

  if (nuevaCantidad > producto.stock) {
    return mostrarMensaje("No hay más stock de " + producto.nombre + ".", "error");
  }
  if (nuevaCantidad < 1) return quitarDelCarrito(id);
  item.cantidad = nuevaCantidad;
  guardarCarrito();
}

function quitarDelCarrito(id) {
  carrito = carrito.filter((i) => i.id !== id);
  guardarCarrito();
}

// Si cambió el stock (u otro usuario compró), se corrigen las cantidades del carrito.
function ajustarCarritoAlStock() {
  carrito = carrito
    .filter((item) => buscarProducto(item.id) && buscarProducto(item.id).stock > 0)
    .map((item) => ({ id: item.id, cantidad: Math.min(item.cantidad, buscarProducto(item.id).stock) }));
  localStorage.setItem("carrito", JSON.stringify(carrito));
  dibujarCarrito();
}

function calcularSubtotal() {
  let subtotal = 0;
  for (const item of carrito) {
    subtotal += buscarProducto(item.id).precio * item.cantidad;
  }
  return subtotal;
}

function dibujarCarrito() {
  // Contador de la barra superior
  const unidades = carrito.reduce((suma, item) => suma + item.cantidad, 0);
  $("#contador-carrito").textContent = unidades;

  // Lista de productos
  if (carrito.length === 0) {
    $("#carrito-items").innerHTML = '<p class="vacio">Tu carrito está vacío.</p>';
  } else {
    $("#carrito-items").innerHTML = carrito.map((item) => {
      const producto = buscarProducto(item.id);
      if (!producto) return "";  // todavía no se cargó el catálogo
      return `
        <div class="item-carrito">
          <div>
            <b>${textoSeguro(producto.nombre)}</b><br>
            <small>${pesos(producto.precio)} c/u</small>
          </div>
          <div class="cantidad">
            <button type="button" onclick="cambiarCantidad(${item.id}, -1)">−</button>
            <span>${item.cantidad}</span>
            <button type="button" onclick="cambiarCantidad(${item.id}, +1)">+</button>
          </div>
          <b>${pesos(producto.precio * item.cantidad)}</b>
          <button type="button" class="link-quitar" onclick="quitarDelCarrito(${item.id})">Quitar</button>
        </div>`;
    }).join("");
  }

  // Totales
  const subtotal = productos.length ? calcularSubtotal() : 0;
  $("#total-subtotal").textContent = pesos(subtotal);
  if (cotizacion) {
    $("#total-envio").textContent = pesos(cotizacion.costo_envio);
    $("#total-final").textContent = pesos(subtotal + cotizacion.costo_envio);
    $("#cotizacion").textContent = "Distancia desde el kiosco: " + cotizacion.distancia_km.toLocaleString("es-AR") + " km";
  } else {
    $("#total-envio").textContent = "A calcular";
    $("#total-final").textContent = pesos(subtotal);
  }
  $("#cotizacion").hidden = !cotizacion;

  // Botón: primero "Calcular envío", después "Confirmar pedido"
  const boton = $("#btn-checkout");
  boton.textContent = cotizacion ? "Confirmar pedido" : "Calcular envío";
  boton.disabled = !usuario || carrito.length === 0;
  $("#nota-ingresar").hidden = Boolean(usuario);
}

function abrirCarrito() {
  dibujarCarrito();
  $("#carrito").classList.add("abierto");
  $("#fondo-carrito").hidden = false;
}

function cerrarCarrito() {
  $("#carrito").classList.remove("abierto");
  $("#fondo-carrito").hidden = true;
}

// Si el usuario cambia la dirección, el costo de envío calculado ya no sirve.
function direccionModificada() {
  if (cotizacion) {
    cotizacion = null;
    dibujarCarrito();
  }
}

// El mismo botón hace dos pasos: 1) calcular el envío, 2) confirmar el pedido.
async function enviarCheckout(evento) {
  evento.preventDefault();
  const form = evento.target;
  const direccion = form.direccion.value.trim();

  if (direccion.length < 5) return mostrarError(form, "Ingresá la dirección completa (calle, número y localidad).");
  mostrarError(form, "");

  await conBotonCargando($("#btn-checkout"), async () => {
    try {
      if (!cotizacion) {
        await calcularEnvio(direccion);
      } else {
        await confirmarPedido(direccion);
        form.reset();
      }
    } catch (error) {
      mostrarError(form, error.message);
    }
  });
  dibujarCarrito();
}

async function calcularEnvio(direccion) {
  const respuesta = await api("/envio/cotizar", { metodo: "POST", datos: { direccion_destino: direccion } });
  cotizacion = { direccion: direccion, distancia_km: respuesta.distancia_km, costo_envio: respuesta.costo_envio };
}

async function confirmarPedido(direccion) {
  const items = carrito.map((item) => ({ producto_id: item.id, cantidad: item.cantidad }));
  const pedido = await api("/pedidos", { metodo: "POST", datos: { direccion_envio: direccion, items: items } });

  carrito = [];
  cotizacion = null;
  localStorage.setItem("carrito", "[]");
  cerrarCarrito();
  mostrarMensaje("¡Pedido #" + pedido.id + " confirmado! Total: " + pesos(pedido.total));
  irA("pedidos");
}


// ---------------------------------------------------------------------
// 8. MIS PEDIDOS
// ---------------------------------------------------------------------
async function cargarMisPedidos() {
  try {
    if (productos.length === 0) await cargarProductos();
    const pedidos = await api("/pedidos/me");
    pedidos.sort((a, b) => b.id - a.id);  // los más nuevos primero

    if (pedidos.length === 0) {
      $("#lista-pedidos").innerHTML = '<p class="vacio">Todavía no hiciste pedidos.</p>';
      return;
    }
    $("#lista-pedidos").innerHTML = pedidos.map(tarjetaDePedido).join("");
  } catch (error) {
    $("#lista-pedidos").innerHTML = `<p class="vacio">No se pudieron cargar tus pedidos. ${error.message}</p>`;
  }
}

function tarjetaDePedido(pedido) {
  const lineas = pedido.detalles.map((d) => `
    <li>${d.cantidad} × ${textoSeguro(nombreDeProducto(d.producto_id))}
      <span>${pesos(d.cantidad * d.precio_unitario)}</span></li>`).join("");

  return `
    <article class="pedido">
      <div class="pedido-cabecera">
        <div><h3>Pedido #${pedido.id}</h3><small>${formatearFecha(pedido.fecha)}</small></div>
        <span class="estado estado-${pedido.estado}">${ESTADOS[pedido.estado]}</span>
      </div>
      ${lineaDeTiempo(pedido.estado)}
      <ul class="pedido-items">${lineas}</ul>
      <p class="pedido-resumen">
        <span>Envío a ${textoSeguro(pedido.direccion_envio)}: ${pesos(pedido.costo_envio)}</span>
        <b>Total ${pesos(pedido.total)}</b>
      </p>
    </article>`;
}

// Dibuja los pasos Pendiente → Confirmado → En camino → Entregado
function lineaDeTiempo(estado) {
  if (estado === "cancelado") return "";
  const pasos = ["pendiente", "confirmado", "en_camino", "entregado"];
  const pasoActual = pasos.indexOf(estado);
  const items = pasos.map((paso, i) => `<li class="${i <= pasoActual ? "hecho" : ""}">${ESTADOS[paso]}</li>`);
  return `<ol class="linea-tiempo">${items.join("")}</ol>`;
}

function nombreDeProducto(id) {
  const producto = buscarProducto(id);
  return producto ? producto.nombre : "Producto #" + id;
}


// ---------------------------------------------------------------------
// 9. ADMINISTRACIÓN
// ---------------------------------------------------------------------
async function cargarAdmin() {
  try {
    await cargarProductos();
    pedidosAdmin = await api("/pedidos");
    pedidosAdmin.sort((a, b) => b.id - a.id);
    dibujarEstadisticas();
    dibujarTablaPedidos();
    dibujarTablaProductos();
  } catch (error) {
    $("#tabla-pedidos").innerHTML = `<p class="vacio">No se pudo cargar la información. ${error.message}</p>`;
  }
}

function mostrarPestanaAdmin(cual) {
  for (const pestana of ["pedidos", "productos", "apariencia"]) {
    $("#panel-" + pestana).hidden = cual !== pestana;
    $("#pestana-" + pestana).classList.toggle("activa", cual === pestana);
  }
  if (cual === "apariencia") cargarSelectoresDeColor();
}

function dibujarEstadisticas() {
  const contar = (estado) => pedidosAdmin.filter((p) => p.estado === estado).length;
  const facturado = pedidosAdmin
    .filter((p) => p.estado !== "cancelado")
    .reduce((suma, p) => suma + p.total, 0);
  const sinStock = productos.filter((p) => p.stock === 0).length;

  $("#estadisticas").innerHTML = `
    <div><small>Pedidos totales</small><b>${pedidosAdmin.length}</b></div>
    <div><small>Pendientes</small><b>${contar("pendiente")}</b></div>
    <div><small>En camino</small><b>${contar("en_camino")}</b></div>
    <div><small>Facturado</small><b>${pesos(facturado)}</b></div>
    <div><small>Productos sin stock</small><b>${sinStock}</b></div>`;
}

function dibujarTablaPedidos() {
  const filtro = $("#filtro-estado").value;
  const pedidos = pedidosAdmin.filter((p) => filtro === "" || p.estado === filtro);

  if (pedidos.length === 0) {
    $("#tabla-pedidos").innerHTML = '<p class="vacio">No hay pedidos para mostrar.</p>';
    return;
  }

  const filas = pedidos.map((pedido) => {
    const productosDelPedido = pedido.detalles
      .map((d) => d.cantidad + " × " + textoSeguro(nombreDeProducto(d.producto_id)))
      .join("<br>");
    const opciones = Object.keys(ESTADOS)
      .map((e) => `<option value="${e}" ${e === pedido.estado ? "selected" : ""}>${ESTADOS[e]}</option>`)
      .join("");

    return `
      <tr>
        <td>${pedido.id}</td>
        <td>${formatearFecha(pedido.fecha)}</td>
        <td>Cliente #${pedido.usuario_id}</td>
        <td>${productosDelPedido}</td>
        <td>${textoSeguro(pedido.direccion_envio)}</td>
        <td class="numero">${pesos(pedido.total)}</td>
        <td><select onchange="cambiarEstadoPedido(${pedido.id}, this)">${opciones}</select></td>
      </tr>`;
  }).join("");

  $("#tabla-pedidos").innerHTML = `
    <table>
      <tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Dirección</th><th class="numero">Total</th><th>Estado</th></tr>
      ${filas}
    </table>`;
}

async function cambiarEstadoPedido(id, select) {
  try {
    await api("/pedidos/" + id + "/estado", { metodo: "PATCH", datos: { estado: select.value } });
    mostrarMensaje("Pedido #" + id + ": " + ESTADOS[select.value] + ".");
    await cargarAdmin();
  } catch (error) {
    mostrarMensaje(error.message, "error");
    await cargarAdmin();  // vuelve a mostrar el estado anterior
  }
}

function dibujarTablaProductos() {
  const ordenados = [...productos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const filas = ordenados.map((p) => `
    <tr>
      <td><b>${textoSeguro(p.nombre)}</b><br><small>${textoSeguro(p.descripcion || "")}</small></td>
      <td class="numero">${pesos(p.precio)}</td>
      <td class="numero">${p.stock === 0 ? "Sin stock" : p.stock}</td>
      <td class="numero">
        <button class="btn btn-borde btn-chico" onclick="abrirFormularioProducto(${p.id})">Editar</button>
        <button class="btn btn-peligro btn-chico" onclick="eliminarProducto(${p.id})">Eliminar</button>
      </td>
    </tr>`).join("");

  $("#tabla-productos").innerHTML = `
    <table>
      <tr><th>Producto</th><th class="numero">Precio</th><th class="numero">Stock</th><th></th></tr>
      ${filas}
    </table>`;
}

// Abre el formulario vacío (producto nuevo) o con los datos de un producto (editar).
function abrirFormularioProducto(id = null) {
  const form = $("#form-producto");
  productoEditando = id ? buscarProducto(id) : null;

  form.reset();
  mostrarError(form, "");
  $("#titulo-producto").textContent = productoEditando ? "Editar producto" : "Nuevo producto";
  if (productoEditando) {
    form.nombre.value = productoEditando.nombre;
    form.descripcion.value = productoEditando.descripcion || "";
    form.precio.value = productoEditando.precio;
    form.stock.value = productoEditando.stock;
  }
  $("#dialogo-producto").showModal();
}

function cerrarFormularioProducto() {
  $("#dialogo-producto").close();
}

async function guardarProducto(evento) {
  evento.preventDefault();
  const form = evento.target;
  const producto = {
    nombre: form.nombre.value.trim(),
    descripcion: form.descripcion.value.trim() || null,
    precio: Number(form.precio.value),
    stock: Number(form.stock.value),
  };

  if (producto.nombre.length < 2) return mostrarError(form, "El nombre debe tener al menos 2 caracteres.");
  if (form.precio.value === "" || producto.precio <= 0) return mostrarError(form, "El precio debe ser mayor a 0.");
  if (form.stock.value === "" || !Number.isInteger(producto.stock) || producto.stock < 0) {
    return mostrarError(form, "El stock debe ser un número entero, 0 o mayor.");
  }
  mostrarError(form, "");

  try {
    if (productoEditando) {
      await api("/productos/" + productoEditando.id, { metodo: "PUT", datos: producto });
      mostrarMensaje("Se actualizó " + producto.nombre + ".");
    } else {
      await api("/productos", { metodo: "POST", datos: producto });
      mostrarMensaje("Se creó " + producto.nombre + ".");
    }
    cerrarFormularioProducto();
    await cargarAdmin();
  } catch (error) {
    mostrarError(form, error.message);
  }
}

async function eliminarProducto(id) {
  const producto = buscarProducto(id);
  if (!confirm("¿Eliminar " + producto.nombre + "? Esta acción no se puede deshacer.")) return;

  try {
    await api("/productos/" + id, { metodo: "DELETE" });
    mostrarMensaje("Se eliminó " + producto.nombre + ".");
    await cargarAdmin();
  } catch (error) {
    mostrarMensaje(error.message, "error");
  }
}


// ---------------------------------------------------------------------
// 10. APARIENCIA: MODO CLARO / OSCURO Y PALETA DE COLORES
// - El modo claro/oscuro lo elige cualquiera (se guarda en el navegador y, si
//   hay sesión iniciada, también en la cuenta).
// - La paleta de colores es solo para administradores y se guarda en la cuenta
//   de cada uno: si entra otro admin, ve sus propios colores.
// ---------------------------------------------------------------------
const COLORES = ["principal", "exito", "aviso", "peligro", "info"];

const PALETAS_RAPIDAS = {
  azul: { principal: "#1c62b9", exito: "#2b8a3e", aviso: "#b35c00", peligro: "#c92a2a", info: "#0b7285" },
  verde: { principal: "#2b8a3e", exito: "#1c7c54", aviso: "#b35c00", peligro: "#c92a2a", info: "#1971c2" },
  violeta: { principal: "#7048e8", exito: "#2b8a3e", aviso: "#b35c00", peligro: "#c2255c", info: "#1971c2" },
  rosa: { principal: "#c2255c", exito: "#2b8a3e", aviso: "#b35c00", peligro: "#e03131", info: "#5f3dc4" },
};

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  $("#btn-tema").textContent = tema === "oscuro" ? "☀️" : "🌙";
  $("#btn-tema").title = tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
}

async function cambiarTema() {
  const nuevoTema = document.documentElement.dataset.tema === "oscuro" ? "claro" : "oscuro";
  aplicarTema(nuevoTema);
  localStorage.setItem("tema", nuevoTema);
  if (!$("#panel-apariencia").hidden) cargarSelectoresDeColor();  // cada modo tiene sus colores originales

  if (usuario) {
    try {
      preferencias = await api("/preferencias", { metodo: "PATCH", datos: { tema: nuevoTema } });
    } catch {
      // Si no se pudo guardar en la cuenta, el modo igual queda guardado en este navegador.
    }
  }
}

// Pinta la página con una paleta. Con null vuelve a los colores originales del CSS.
function aplicarPaleta(paleta) {
  const estilos = document.documentElement.style;
  for (const color of COLORES) {
    if (paleta) estilos.setProperty("--" + color, paleta[color]);
    else estilos.removeProperty("--" + color);
  }
  // Si el color principal es muy claro, el texto de los botones va en negro para que se lea.
  if (paleta && esColorClaro(paleta.principal)) estilos.setProperty("--texto-sobre-principal", "#1f1c18");
  else estilos.removeProperty("--texto-sobre-principal");
}

function esColorClaro(hex) {
  const rojo = parseInt(hex.slice(1, 3), 16);
  const verde = parseInt(hex.slice(3, 5), 16);
  const azul = parseInt(hex.slice(5, 7), 16);
  return 0.299 * rojo + 0.587 * verde + 0.114 * azul > 160;  // brillo percibido (0 a 255)
}

// Trae de la API la apariencia guardada en la cuenta y la aplica.
async function cargarPreferencias() {
  try {
    preferencias = await api("/preferencias");
  } catch {
    preferencias = { tema: null, paleta: null };
  }
  if (preferencias.tema) {
    aplicarTema(preferencias.tema);
    localStorage.setItem("tema", preferencias.tema);
  }
  aplicarPaleta(usuario && usuario.rol === "admin" ? preferencias.paleta : null);
}

// Pone en cada selector de color el color que se está usando ahora.
function cargarSelectoresDeColor() {
  const estilos = getComputedStyle(document.documentElement);
  for (const color of COLORES) {
    $("#color-" + color).value = estilos.getPropertyValue("--" + color).trim();
  }
}

function leerSelectoresDeColor() {
  const paleta = {};
  for (const color of COLORES) paleta[color] = $("#color-" + color).value;
  return paleta;
}

// Muestra los colores elegidos sin guardarlos todavía.
function previsualizarPaleta() {
  aplicarPaleta(leerSelectoresDeColor());
}

function elegirPaletaRapida(nombre) {
  aplicarPaleta(PALETAS_RAPIDAS[nombre]);
  cargarSelectoresDeColor();
}

async function guardarPaleta() {
  try {
    preferencias = await api("/preferencias", { metodo: "PATCH", datos: { paleta: leerSelectoresDeColor() } });
    aplicarPaleta(preferencias.paleta);
    mostrarMensaje("Colores guardados. Solo se aplican a tu cuenta.");
  } catch (error) {
    mostrarMensaje(error.message, "error");
  }
}

async function restaurarPaleta() {
  try {
    preferencias = await api("/preferencias", { metodo: "PATCH", datos: { paleta: null } });
    aplicarPaleta(null);
    cargarSelectoresDeColor();
    mostrarMensaje("Volviste a los colores originales.");
  } catch (error) {
    mostrarMensaje(error.message, "error");
  }
}


// ---------------------------------------------------------------------
// 11. INICIO DE LA APLICACIÓN
// ---------------------------------------------------------------------
async function iniciar() {
  aplicarTema(document.documentElement.dataset.tema);

  // Si había una sesión guardada, se recupera el usuario y su apariencia.
  if (token) {
    try {
      usuario = await api("/auth/me");
      await cargarPreferencias();
    } catch {
      token = null;
      usuario = null;
      localStorage.removeItem("token");
    }
  }
  dibujarBarra();
  dibujarCarrito();
  window.addEventListener("hashchange", mostrarPantalla);
  await mostrarPantalla();
}

iniciar();
