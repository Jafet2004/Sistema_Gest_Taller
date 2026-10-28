// =========================================================
// CLIENTES Y VEHÍCULOS
// Flujo: 1) buscar/crear cliente → 2) ver/registrar sus vehículos
//        → 3) "Ingresar al taller" abre ordenes.html?vehiculo=ID
// =========================================================
const API = "http://localhost:3000";

let clienteActual = null;
let vehiculos = [];
let editandoVeh = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const C = n => "C$ " + Number(n || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = s => s ? new Date(s).toLocaleDateString("es-NI") : "—";
const nombre = c => `${c.pr_name} ${c.sc_name || ""} ${c.pr_lastname} ${c.sc_lastname || ""}`.replace(/\s+/g, " ").trim();
const ESTADOS = { RECIBIDO: "Recibido", EN_PROCESO: "En proceso", TERMINADO: "Terminado", ENTREGADO: "Entregado", CANCELADO: "Cancelado" };

async function api(ruta, opciones = {}) {
    const res = await fetch(API + ruta, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...opciones,
        body: opciones.body ? JSON.stringify(opciones.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || "Error del servidor");
    return data;
}

// =========================================================
// PASO 1: BUSCAR CLIENTE
// =========================================================
let timer;
$("qCliente").addEventListener("input", e => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    if (q.length < 2) { $("resultados").innerHTML = ""; return; }
    timer = setTimeout(() => buscarClientes(q), 250);   // espera a que deje de escribir
});

async function buscarClientes(q) {
    try {
        const lista = await api(`/clientes/buscar?q=${encodeURIComponent(q)}`);
        $("resultados").innerHTML = lista.length
            ? lista.map(c => `
                <button type="button" class="resultado" data-id="${c.id_client}">
                    <span><strong>${esc(nombre(c))}</strong><small><i class="fas fa-phone"></i> ${esc(c.celular)}</small></span>
                    <small>${c.total_vehiculos} vehículo(s) <i class="fas fa-chevron-right"></i></small>
                </button>`).join("")
            : `<p class="hint">Sin resultados para “${esc(q)}”.</p>`;
        $("resultados").querySelectorAll("[data-id]").forEach(b =>
            b.addEventListener("click", () => seleccionarCliente(lista.find(c => c.id_client == b.dataset.id))));
    } catch (e) { notificarSistema(e.message, "error"); }
}

// Nuevo cliente desde aquí mismo
$("lnkNuevoCliente").addEventListener("click", e => {
    e.preventDefault();
    $("formCliente").hidden = false;
    // Si escribió un nombre en el buscador, lo usamos para prellenar
    const partes = $("qCliente").value.trim().split(/\s+/);
    if (partes[0] && isNaN(partes[0])) $("c_pr_name").value = partes[0];
    if (partes[1]) $("c_pr_lastname").value = partes[1];
    $("c_pr_name").focus();
});
$("btnCancelarCliente").addEventListener("click", () => { $("formCliente").reset(); $("formCliente").hidden = true; });

$("formCliente").addEventListener("submit", async e => {
    e.preventDefault();
    const c = {
        pr_name: $("c_pr_name").value.trim(), sc_name: $("c_sc_name").value.trim(),
        pr_lastname: $("c_pr_lastname").value.trim(), sc_lastname: $("c_sc_lastname").value.trim(),
        celular: $("c_celular").value.trim(),
        cedula: $("c_cedula").value.trim()
    };
    try {
        const r = await api("/clientes", { method: "POST", body: c });
        notificarSistema("Cliente registrado", "exito");
        e.target.reset(); e.target.hidden = true;
        seleccionarCliente({ ...c, id_client: r.id_client });
    } catch (err) { notificarSistema(err.message, "error"); }
});

// =========================================================
// PASO 2: CLIENTE SELECCIONADO → SUS VEHÍCULOS
// =========================================================
async function seleccionarCliente(c) {
    clienteActual = c;
    history.replaceState(null, "", `?cliente=${c.id_client}`);   // permite volver/recargar
    $("panelBuscar").hidden = true;
    $("panelCliente").hidden = false;
    $("avatar").textContent = (c.pr_name[0] + c.pr_lastname[0]).toUpperCase();
    $("clienteNombre").textContent = nombre(c);
    $("clienteCel").innerHTML = `<i class="fas fa-phone"></i> ${esc(c.celular)}`;
    cancelarEdicionVeh();
    await cargarVehiculos();
    $("Marca").focus();
}

$("btnCambiar").addEventListener("click", () => {
    clienteActual = null;
    history.replaceState(null, "", location.pathname);
    $("panelCliente").hidden = true;
    $("panelBuscar").hidden = false;
    $("qCliente").select();
});

async function cargarVehiculos() {
    try {
        vehiculos = await api(`/clientes/${clienteActual.id_client}/vehiculos`);
    } catch (e) { notificarSistema(e.message, "error"); vehiculos = []; }

    const cont = $("listaVehiculos");
    if (!vehiculos.length) {
        cont.innerHTML = `<p class="hint">Este cliente aún no tiene vehículos. Regístrelo abajo.</p>`;
        return;
    }
    cont.innerHTML = vehiculos.map(v => {
        const enTaller = !!v.orden_activa;
        return `
        <article class="veh">
            <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:flex-start">
                <h4>${esc(v.Marca)} ${esc(v.Modelo)} ${v.Año ? `<small>(${esc(v.Año)})</small>` : ""}</h4>
                ${enTaller
                    ? `<span class="estado ${v.estado_orden}">En taller · ${ESTADOS[v.estado_orden]}</span>`
                    : `<span class="estado DISPONIBLE">Fuera del taller</span>`}
            </div>
            <div class="chasis">Chasis: ${esc(v.Numero_chasis)}</div>
            <small class="hint">${v.visitas} visita(s) al taller</small>
            <div class="botones">
                ${enTaller
                    ? `<a class="btn btn-rojo btn-mini" data-permiso="ordenes.ver_todas|ordenes.ver_propias" href="ordenes.html?orden=${v.orden_activa}"><i class="fas fa-clipboard-list"></i> Ver orden #${v.orden_activa}</a>`
                    : `<a class="btn btn-rojo btn-mini" data-permiso="ordenes.crear" href="ordenes.html?vehiculo=${v.id_Vehic}"><i class="fas fa-right-to-bracket"></i> Ingresar al taller</a>`}
                <button class="btn btn-gris btn-mini" data-hist="${v.id_Vehic}"><i class="fas fa-clock-rotate-left"></i> Historial</button>
                <button class="btn-icon" title="Editar" data-permiso="clientes.editar" data-edit="${v.id_Vehic}"><i class="fas fa-pen"></i></button>
                <button class="btn-icon" title="Eliminar" data-permiso="clientes.editar" data-del="${v.id_Vehic}"><i class="fas fa-trash"></i></button>
            </div>
        </article>`;
    }).join("");
}

$("listaVehiculos").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.hist) verHistorial(b.dataset.hist);
    if (b.dataset.edit) editarVehiculo(b.dataset.edit);
    if (b.dataset.del) eliminarVehiculo(b.dataset.del);
});

// ---------- registrar / editar vehículo ----------
$("Numero_chasis").addEventListener("input", e => e.target.value = e.target.value.toUpperCase());

$("formVehiculo").addEventListener("submit", async e => {
    e.preventDefault();
    const v = {
        id_client: clienteActual.id_client,
        Marca: $("Marca").value.trim(),
        Modelo: $("Modelo").value.trim(),
        Año: $("Anio").value.trim(),
        Numero_chasis: $("Numero_chasis").value.trim()
    };
    try {
        if (editandoVeh) {
            await api(`/vehiculos/${editandoVeh}`, { method: "PUT", body: v });
            notificarSistema("Vehículo actualizado", "exito");
            cancelarEdicionVeh();
            cargarVehiculos();
            return;
        }
        const r = await api("/vehiculos", { method: "POST", body: v });
        e.target.reset();
        await cargarVehiculos();
        const ingresar = await confirmarSistema(
            `${esc(v.Marca)} ${esc(v.Modelo)} quedó registrado a nombre de ${esc(nombre(clienteActual))}.<br><br>¿Desea ingresarlo al taller ahora?`,
            "Vehículo registrado");
        if (ingresar) location.href = `ordenes.html?vehiculo=${r.id_Vehic}`;
    } catch (err) { notificarSistema(err.message, "error"); }
});

function editarVehiculo(id) {
    const v = vehiculos.find(x => x.id_Vehic == id);
    editandoVeh = v.id_Vehic;
    $("Marca").value = v.Marca; $("Modelo").value = v.Modelo;
    $("Anio").value = v.Año || ""; $("Numero_chasis").value = v.Numero_chasis;
    $("tituloFormVeh").innerHTML = `<i class="fas fa-pen"></i> Editando ${esc(v.Marca)} ${esc(v.Modelo)}`;
    $("btnGuardarVeh").innerHTML = `<i class="fas fa-save"></i> Guardar cambios`;
    $("btnCancelarVeh").hidden = false;
    $("Marca").focus();
}

function cancelarEdicionVeh() {
    editandoVeh = null;
    $("formVehiculo").reset();
    $("tituloFormVeh").innerHTML = `<i class="fas fa-plus"></i> Registrar vehículo a este cliente`;
    $("btnGuardarVeh").innerHTML = `<i class="fas fa-save"></i> Registrar vehículo`;
    $("btnCancelarVeh").hidden = true;
}
$("btnCancelarVeh").addEventListener("click", cancelarEdicionVeh);

async function eliminarVehiculo(id) {
    if (!await confirmarSistema("¿Eliminar este vehículo? Solo es posible si nunca ha entrado al taller.", "Eliminar vehículo")) return;
    try {
        const r = await api(`/vehiculos/${id}`, { method: "DELETE" });
        notificarSistema(r.message, "exito");
        cargarVehiculos();
    } catch (err) { notificarSistema(err.message, "error"); }
}

// ---------- historial ----------
async function verHistorial(id) {
    const v = vehiculos.find(x => x.id_Vehic == id);
    $("histTitulo").textContent = `Historial — ${v.Marca} ${v.Modelo} (${v.Numero_chasis})`;
    try {
        const h = await api(`/vehiculos/${id}/historial`);
        $("histBody").innerHTML = h.length ? h.map(o => `
            <tr>
                <td><a href="ordenes.html?orden=${o.id_orden}">#${o.id_orden}</a></td>
                <td>${fecha(o.fecha_entrada)}</td>
                <td>${fecha(o.fecha_salida)}</td>
                <td>${esc(o.servicios || "—")}</td>
                <td class="num">${C(o.total)}</td>
                <td><span class="estado ${o.estado}">${ESTADOS[o.estado]}</span></td>
            </tr>`).join("")
            : `<tr><td colspan="6" class="vacio">Nunca ha entrado al taller</td></tr>`;
        $("modalHist").hidden = false;
    } catch (err) { notificarSistema(err.message, "error"); }
}
document.querySelectorAll("[data-cerrar]").forEach(b =>
    b.addEventListener("click", () => b.closest(".modal").hidden = true));

// =========================================================
// INICIO: si viene ?cliente=ID lo selecciona directamente
// =========================================================
(async () => {
    const id = new URLSearchParams(location.search).get("cliente");
    if (!id) { $("qCliente").focus(); return; }
    try {
        const todos = await api("/clientes");
        const c = todos.find(x => x.id_client == id);
        if (c) seleccionarCliente(c);
    } catch (e) { notificarSistema(e.message, "error"); }
})();
