// =========================================================
// ÓRDENES DE SERVICIO — entrada del vehículo al taller
// ordenes.html?vehiculo=ID → abre la recepción con ese vehículo
// ordenes.html?orden=ID    → abre el detalle de esa orden
// =========================================================
const API = "http://localhost:3000";

let catalogo = [];          // List_Trabajo
let productosInv = [];      // repuestos del inventario
let trabajadores = [];
let vehiculosTodos = [];
let vehiculoSel = null;
let fotosEntrada = [];
let filtro = "activas";
let ordenAbierta = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const C = n => "C$ " + Number(n || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = s => s ? new Date(s.replace(" ", "T")).toLocaleString("es-NI", { dateStyle: "short", timeStyle: "short" }) : "—";
const ESTADOS = { RECIBIDO: "Recibido", EN_PROCESO: "En proceso", TERMINADO: "Terminado", ENTREGADO: "Entregado", CANCELADO: "Cancelado" };

async function api(ruta, opciones = {}) {
    const res = await fetch(API + ruta, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...opciones,
        body: opciones.body ? JSON.stringify(opciones.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || data.error || "Error del servidor"), { status: res.status, data: data.data });
    return data;
}

// Reduce las fotos (máx 1280px, JPEG) para no llenar la BD
function comprimirImagen(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const k = Math.min(1, 1280 / Math.max(img.width, img.height));
            const cv = document.createElement("canvas");
            cv.width = img.width * k; cv.height = img.height * k;
            cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
            URL.revokeObjectURL(img.src);
            resolve(cv.toDataURL("image/jpeg", 0.75));
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}
async function leerFotos(input, max = 5) {
    const files = [...input.files];
    if (files.length > max) { notificarSistema(`Máximo ${max} fotos`, "error"); input.value = ""; return []; }
    return Promise.all(files.map(comprimirImagen));
}

// =========================================================
// RECEPCIÓN: elegir vehículo
// =========================================================
$("qVehiculo").addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    if (q.length < 2) { $("resVehiculos").innerHTML = ""; return; }
    const encontrados = vehiculosTodos.filter(v =>
        `${v.Numero_chasis} ${v.Marca} ${v.Modelo} ${v.pr_name} ${v.pr_lastname}`.toLowerCase().includes(q)
    ).slice(0, 10);
    $("resVehiculos").innerHTML = encontrados.length ? encontrados.map(v => {
        const enTaller = ["RECIBIDO", "EN_PROCESO", "TERMINADO"].includes(v.estado_orden);
        return `
        <button type="button" class="resultado" data-id="${v.id_Vehic}">
            <span><strong>${esc(v.Marca)} ${esc(v.Modelo)} ${v.Año ? `(${esc(v.Año)})` : ""}</strong>
                  <small>${esc(v.pr_name)} ${esc(v.pr_lastname)} · Chasis ${esc(v.Numero_chasis)}</small></span>
            ${enTaller ? `<span class="estado ${v.estado_orden}">Ya en taller</span>` : `<i class="fas fa-chevron-right"></i>`}
        </button>`;
    }).join("") : `<p class="hint">Sin resultados.</p>`;
});

$("resVehiculos").addEventListener("click", e => {
    const b = e.target.closest("[data-id]");
    if (b) seleccionarVehiculo(b.dataset.id);
});

function seleccionarVehiculo(id) {
    const v = vehiculosTodos.find(x => x.id_Vehic == id);
    if (!v) return notificarSistema("Vehículo no encontrado", "error");
    if (["RECIBIDO", "EN_PROCESO", "TERMINADO"].includes(v.estado_orden)) {
        notificarSistema(`Este vehículo ya está en el taller (orden #${v.id_orden}). Agregue servicios a esa orden.`, "advertencia");
        return abrirOrden(v.id_orden);
    }
    vehiculoSel = v;
    $("selVehiculo").textContent = `${v.Marca} ${v.Modelo} ${v.Año ? `(${v.Año})` : ""} · Chasis ${v.Numero_chasis}`;
    $("selCliente").innerHTML = `<i class="fas fa-user"></i> ${esc(v.pr_name)} ${esc(v.pr_lastname)}`;
    $("pasoVehiculo").hidden = true;
    $("formOrden").hidden = false;
}

$("btnOtroVeh").addEventListener("click", limpiarRecepcion);

function limpiarRecepcion() {
    vehiculoSel = null; fotosEntrada = [];
    $("formOrden").reset(); $("formOrden").hidden = true;
    $("prevEntrada").innerHTML = "";
    $("pasoVehiculo").hidden = false;
    $("qVehiculo").value = ""; $("resVehiculos").innerHTML = "";
    actualizarTotal();
    history.replaceState(null, "", location.pathname);
}

// ---------- servicios (checkboxes) ----------
function pintarCatalogo() {
    $("listaServicios").innerHTML = catalogo.map(t => `
        <label class="serv-op">
            <input type="checkbox" value="${t.id_trabajo}">
            <span><b>${esc(t.Name_trabajo)}</b><small>${esc(t.Detalle_trab)}</small></span>
            <span class="precio">${C(t.Total)}</span>
        </label>`).join("") || `<p class="hint">No hay servicios en el catálogo. Créelos en <a href="serv.html">Servicios</a>.</p>`;
    $("mNuevoServ").innerHTML = `<option value="">Seleccione…</option>` +
        catalogo.map(t => `<option value="${t.id_trabajo}">${esc(t.Name_trabajo)} — ${C(t.Total)}</option>`).join("");
}

function seleccionados() {
    return [...$("listaServicios").querySelectorAll("input:checked")].map(i => Number(i.value));
}
function actualizarTotal() {
    const ids = seleccionados();
    const total = catalogo.filter(t => ids.includes(t.id_trabajo)).reduce((s, t) => s + Number(t.Total), 0);
    $("cantServ").textContent = `${ids.length} servicio(s)`;
    $("totalOrden").textContent = C(total);
}
$("listaServicios").addEventListener("change", actualizarTotal);

$("fotosEntrada").addEventListener("change", async e => {
    fotosEntrada = await leerFotos(e.target);
    $("prevEntrada").innerHTML = fotosEntrada.map(f => `<img src="${f}">`).join("");
});

$("formOrden").addEventListener("submit", async e => {
    e.preventDefault();
    const servicios = seleccionados();
    if (!servicios.length) return notificarSistema("Seleccione al menos un servicio", "error");
    try {
        const r = await api("/ordenes", {
            method: "POST",
            body: {
                id_Vehic: vehiculoSel.id_Vehic,
                servicios,
                kilometraje: $("kilometraje").value || null,
                observaciones: $("observaciones").value,
                foto_int: fotosEntrada
            }
        });
        notificarSistema(`${r.message} — Orden #${r.id_orden}`, "exito");
        if (r.aviso_stock) notificarSistema(r.aviso_stock + ". Reabastezca antes de iniciar el trabajo.", "advertencia", 9000);
        limpiarRecepcion();
        await Promise.all([cargarVehiculos(), cargarOrdenes()]);
    } catch (err) { notificarSistema(err.message, "error"); }
});

// =========================================================
// LISTA DE ÓRDENES
// =========================================================
$("filtros").addEventListener("click", e => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    filtro = b.dataset.f;
    document.querySelectorAll(".filtro").forEach(x => x.classList.toggle("activo", x === b));
    cargarOrdenes();
});

async function cargarOrdenes() {
    try {
        const ordenes = await api(`/ordenes?estado=${filtro}`);
        $("tablaOrdenes").innerHTML = ordenes.length ? ordenes.map(o => {
            const saldo = Number(o.total) - Number(o.pagado);
            return `
            <tr>
                <td>${o.id_orden}</td>
                <td>${fecha(o.fecha_entrada)}</td>
                <td>${esc(o.cliente)}</td>
                <td>${esc(o.Marca)} ${esc(o.Modelo)}<br><small>${esc(o.Numero_chasis)}</small></td>
                <td>${esc(o.servicios)}</td>
                <td class="num">${C(o.total)}</td>
                <td class="num ${saldo > 0 ? "rojo" : "verde"}">${saldo > 0 ? C(saldo) : "Pagado"}</td>
                <td><span class="estado ${o.estado}">${ESTADOS[o.estado]}</span></td>
                <td><button class="btn btn-mini" data-ver="${o.id_orden}">Ver</button></td>
            </tr>`;
        }).join("") : `<tr><td colspan="9" class="vacio">No hay órdenes</td></tr>`;
    } catch (err) { notificarSistema(err.message, "error"); }
}

$("tablaOrdenes").addEventListener("click", e => {
    const b = e.target.closest("[data-ver]");
    if (b) abrirOrden(b.dataset.ver);
});

$("buscar").addEventListener("input", function () {
    const v = this.value.toLowerCase();
    document.querySelectorAll("#tablaOrdenes tr").forEach(tr =>
        tr.style.display = tr.innerText.toLowerCase().includes(v) ? "" : "none");
});

// =========================================================
// DETALLE DE ORDEN (modal)
// =========================================================
async function abrirOrden(id) {
    try {
        const o = await api(`/ordenes/${id}`);
        ordenAbierta = o;
        const activa = ["RECIBIDO", "EN_PROCESO", "TERMINADO"].includes(o.estado);
        const saldo = Number(o.total) - Number(o.pagado);

        $("mTitulo").textContent = `Orden #${o.id_orden} — ${o.Marca} ${o.Modelo}`;
        $("mEstado").className = `estado ${o.estado}`;
        $("mEstado").textContent = ESTADOS[o.estado];

        $("mDatos").innerHTML = `
            <div><span>Cliente</span>${esc(o.cliente)}</div>
            <div><span>Celular</span>${esc(o.celular)}</div>
            <div><span>Chasis</span>${esc(o.Numero_chasis)}</div>
            <div><span>Entrada</span>${fecha(o.fecha_entrada)}</div>
            <div><span>Salida</span>${fecha(o.fecha_salida)}${o.trabajador_entrega ? `<br><small>${esc(o.trabajador_entrega)}</small>` : ""}</div>
            <div><span>Kilometraje</span>${o.kilometraje ?? "—"}</div>
            <div><span>Total</span><b>${C(o.total)}</b>${Number(o.total_repuestos) > 0 ? `<br><small>Servicios ${C(o.total_servicios)} + repuestos ${C(o.total_repuestos)}</small>` : ""}</div>
            <div><span>Pagado</span>${C(o.pagado)}</div>
            <div><span>Saldo</span><b class="${saldo > 0 ? "rojo" : "verde"}">${C(saldo)}</b></div>
            ${o.observaciones ? `<div style="grid-column:1/-1"><span>Observaciones</span>${esc(o.observaciones)}</div>` : ""}`;

        const opcionesTrab = id => `<option value="">— Sin asignar —</option>` + trabajadores.map(t =>
            `<option value="${t.id_trab}" ${t.id_trab == id ? "selected" : ""}>${esc(t.pr_name)} ${esc(t.pr_lastname)}</option>`).join("");

        $("mServicios").innerHTML = o.detalle.map(d => `
            <tr>
                <td><b>${esc(d.Name_trabajo)}</b><br><small>${esc(d.Detalle_trab)}</small></td>
                <td>${activa && puede("ordenes.ver_todas") && puede("ordenes.avanzar")
                    ? `<select data-mec="${d.id_detalle}">${opcionesTrab(d.id_trab)}</select>`
                    : esc(d.mecanico || "—")}</td>
                <td class="num">${C(d.precio)}</td>
                <td>${activa && o.detalle.length > 1
                    ? `<button class="btn-icon" title="Quitar" data-permiso="ordenes.crear" data-quitar="${d.id_detalle}"><i class="fas fa-trash"></i></button>` : ""}</td>
            </tr>`).join("");
        $("mAgregar").hidden = !activa;

        // ---- Repuestos ----
        const consumida = ["EN_PROCESO", "TERMINADO", "ENTREGADO"].includes(o.estado);
        $("mRepuestos").innerHTML = o.repuestos.length ? o.repuestos.map(r => {
            const falta = !Number(r.descontado) && Number(r.stock) < Number(r.cantidad);
            return `
            <tr>
                <td><b>${esc(r.nombre)}</b><br><small>${esc(r.codigo)}</small></td>
                <td>${Number(r.cobrar) ? `<span class="badge pedido">Adicional</span>` : `<small>Receta: ${esc(r.servicio || "—")}</small>`}</td>
                <td class="num">${Number(r.cantidad)} ${esc(r.unidad)}</td>
                <td class="num">${Number(r.cobrar) ? C(r.cantidad * r.precio_unit) : "<small>Incluido</small>"}</td>
                <td>${Number(r.descontado) ? `<span class="badge ok">Descontado</span>`
                    : falta ? `<span class="badge bajo">Sin stock (hay ${Number(r.stock)})</span>`
                    : `<span class="badge gris">Por descontar</span>`}</td>
                <td>${activa && Number(r.cobrar) ? `<button class="btn-icon" title="Quitar" data-permiso="ordenes.avanzar" data-quitarrep="${r.id_rep}"><i class="fas fa-trash"></i></button>` : ""}</td>
            </tr>`;
        }).join("") : `<tr><td colspan="6" class="vacio">Sin repuestos del inventario</td></tr>`;
        $("mAgregarRep").hidden = !activa;
        $("mRepProd").innerHTML = `<option value="">Seleccione…</option>` + productosInv.map(p =>
            `<option value="${p.id_producto}">${esc(p.nombre)} — stock ${Number(p.stock)} ${esc(p.unidad)} — ${C(p.precio_venta)}</option>`).join("");
        const faltan = consumida ? [] : o.repuestos.filter(r => !Number(r.descontado) && Number(r.stock) < Number(r.cantidad));
        $("mFaltantes").hidden = !(activa && faltan.length);
        $("mFaltantesTxt").innerHTML = `Falta stock para iniciar: ` + faltan.map(r => `<b>${esc(r.nombre)}</b>`).join(", ");

        const fotos = [...o.foto_int.map(f => ({ f, t: "Entrada" })), ...o.foto_out.map(f => ({ f, t: "Salida" }))]
            .filter(x => typeof x.f === "string" && x.f.startsWith("data:image"));
        $("mFotosSec").hidden = !fotos.length;
        $("mFotos").innerHTML = fotos.map(x => `<img src="${x.f}" title="${x.t}">`).join("");

        // Botones de avance según el estado
        const acciones = {
            RECIBIDO:   [["EN_PROCESO", "fa-screwdriver-wrench", "Iniciar trabajo", "btn-rojo"], ["CANCELADO", "fa-ban", "Cancelar orden", "btn-gris"]],
            EN_PROCESO: [["TERMINADO", "fa-flag-checkered", "Marcar terminado", "btn-rojo"], ["RECIBIDO", "fa-rotate-left", "Volver a recibido", "btn-gris"], ["CANCELADO", "fa-ban", "Cancelar orden", "btn-gris"]],
            TERMINADO:  [["EN_PROCESO", "fa-rotate-left", "Reabrir trabajo", "btn-gris"]],
            ENTREGADO:  [],
            CANCELADO:  []
        }[o.estado];
        $("mAcciones").innerHTML = acciones.length
            ? acciones.map(([e, i, txt, cls]) => `<button class="btn ${cls}" data-estado="${e}" data-permiso="${e === "CANCELADO" ? "ordenes.crear|ordenes.ver_todas" : "ordenes.avanzar"}"><i class="fas ${i}"></i> ${txt}</button>`).join("")
            : `<p class="hint">Orden ${ESTADOS[o.estado].toLowerCase()}. No admite más cambios.</p>`;

        $("mEntrega").hidden = o.estado !== "TERMINADO";
        $("mTrabajador").innerHTML = `<option value="">Seleccione…</option>` + trabajadores.map(t =>
            `<option value="${t.id_trab}">${esc(t.pr_name)} ${esc(t.pr_lastname)}</option>`).join("");
        $("fotosSalida").value = "";

        $("modalOrden").hidden = false;
        history.replaceState(null, "", `?orden=${o.id_orden}`);
    } catch (err) { notificarSistema(err.message, "error"); }
}

async function refrescarOrden() {
    await cargarProductosInv();
    await Promise.all([abrirOrden(ordenAbierta.id_orden), cargarOrdenes(), cargarVehiculos()]);
}

$("modalOrden").addEventListener("change", async e => {
    const sel = e.target.closest("[data-mec]");
    if (!sel) return;
    try {
        await api(`/ordenes/${ordenAbierta.id_orden}/servicios/${sel.dataset.mec}`, { method: "PUT", body: { id_trab: sel.value } });
        notificarSistema("Mecánico asignado", "exito", 2000);
    } catch (err) { notificarSistema(err.message, "error"); }
});

$("modalOrden").addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b) return;
    try {
        if (b.dataset.quitarrep) {
            if (!await confirmarSistema("¿Quitar este repuesto de la orden? Si ya salió de bodega, regresa al inventario.", "Quitar repuesto")) return;
            await api(`/ordenes/${ordenAbierta.id_orden}/repuestos/${b.dataset.quitarrep}`, { method: "DELETE" });
            notificarSistema("Repuesto quitado", "exito");
            refrescarOrden();
        }
        if (b.dataset.quitar) {
            if (!await confirmarSistema("¿Quitar este servicio de la orden?", "Quitar servicio")) return;
            await api(`/ordenes/${ordenAbierta.id_orden}/servicios/${b.dataset.quitar}`, { method: "DELETE" });
            notificarSistema("Servicio quitado", "exito");
            refrescarOrden();
        }
        if (b.dataset.estado) {
            if (b.dataset.estado === "CANCELADO" &&
                !await confirmarSistema("¿Cancelar esta orden? El vehículo saldrá de la lista del taller.", "Cancelar orden")) return;
            const r = await api(`/ordenes/${ordenAbierta.id_orden}/estado`, { method: "PUT", body: { estado: b.dataset.estado } });
            notificarSistema(r.message, "exito");
            refrescarOrden();
        }
    } catch (err) {
        notificarSistema(err.message, "error", err.data?.faltantes ? 9000 : 4000);
        if (err.data?.faltantes) {
            $("mFaltantes").hidden = false;
            $("mFaltantesTxt").innerHTML = "No se puede iniciar. Falta stock de: " +
                err.data.faltantes.map(f => `<b>${esc(f.nombre)}</b> (faltan ${f.falta} ${esc(f.unidad)})`).join(", ");
        }
    }
});

$("btnAgregarRep").addEventListener("click", async () => {
    const id = $("mRepProd").value;
    if (!id) return notificarSistema("Seleccione un repuesto", "error");
    try {
        await api(`/ordenes/${ordenAbierta.id_orden}/repuestos`, {
            method: "POST",
            body: { id_producto: id, cantidad: $("mRepCant").value, cobrar: $("mRepCobrar").checked }
        });
        notificarSistema("Repuesto agregado a la orden", "exito");
        $("mRepCant").value = 1;
        refrescarOrden();
    } catch (err) { notificarSistema(err.message, "error"); }
});

$("btnAgregarServ").addEventListener("click", async () => {
    const id = $("mNuevoServ").value;
    if (!id) return notificarSistema("Seleccione un servicio", "error");
    try {
        await api(`/ordenes/${ordenAbierta.id_orden}/servicios`, { method: "POST", body: { id_trabajo: id } });
        notificarSistema("Servicio agregado", "exito");
        $("mNuevoServ").value = "";
        refrescarOrden();
    } catch (err) { notificarSistema(err.message, "error"); }
});

$("btnEntregar").addEventListener("click", async () => {
    const id_trab = $("mTrabajador").value;
    if (!id_trab) return notificarSistema("Seleccione el trabajador que entrega", "error");
    const foto_out = await leerFotos($("fotosSalida"));
    const body = { id_trab, foto_out };
    try {
        await api(`/ordenes/${ordenAbierta.id_orden}/salida`, { method: "PUT", body });
    } catch (err) {
        if (err.status !== 402) return notificarSistema(err.message, "error");
        // Tiene saldo pendiente → preguntar
        if (!await confirmarSistema(`${esc(err.message)}<br><br>¿Entregar de todos modos (queda como cuenta por cobrar)?`, "Saldo pendiente")) return;
        try {
            await api(`/ordenes/${ordenAbierta.id_orden}/salida`, { method: "PUT", body: { ...body, entregar_con_saldo: true } });
        } catch (e2) { return notificarSistema(e2.message, "error"); }
    }
    notificarSistema("Vehículo entregado al cliente", "exito");
    refrescarOrden();
});

document.querySelectorAll("[data-cerrar]").forEach(b => b.addEventListener("click", () => {
    b.closest(".modal").hidden = true;
    history.replaceState(null, "", location.pathname);
}));

// =========================================================
// INICIO
// =========================================================
async function cargarVehiculos() {
    if (!puede("ordenes.crear")) return;            // solo recepción busca vehículos para ingresarlos
    try { vehiculosTodos = await api("/vehiculos"); } catch { vehiculosTodos = []; }
}
async function cargarProductosInv() {
    try { productosInv = await api("/productos"); } catch { productosInv = []; }
}

(async () => {
    try {
        await window.sesionLista;
        const opcional = p => p.catch(() => []);   // lo que el rol no puede ver queda vacío
        [catalogo, trabajadores] = await Promise.all([opcional(api("/trabajos")), opcional(api("/trabajadores")), cargarVehiculos(), cargarProductosInv()]);
        if (!puede("ordenes.ver_todas")) document.querySelector("h2 i.fa-warehouse").parentElement.lastChild.textContent = " Mis órdenes asignadas";
        pintarCatalogo();
        await cargarOrdenes();

        const p = new URLSearchParams(location.search);
        if (p.get("vehiculo")) seleccionarVehiculo(p.get("vehiculo"));
        if (p.get("orden")) abrirOrden(p.get("orden"));
    } catch (err) { notificarSistema("No se pudo cargar: " + err.message, "error"); }
})();
