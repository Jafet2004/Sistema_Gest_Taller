// =========================================================
// CAJA — Taller Rostrán
// Apertura → Pago / Egreso → Arqueo → Cierre → Depósito
// =========================================================
const API_CAJA = "http://localhost:3000/caja";

// Billetes y monedas de córdoba
const DENOMINACIONES = [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.5];

let resumenActual = null;   // resumen de la sesión abierta
let pendientes = [];        // vehículos con saldo
let historial = [];
let depositoSesion = null;

// ---------- utilidades ----------
const $ = id => document.getElementById(id);
const C = n => "C$ " + Number(n || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fecha = s => s ? new Date(s.replace(" ", "T")).toLocaleString("es-NI", { dateStyle: "short", timeStyle: "short" }) : "—";
const hora = s => s ? new Date(s.replace(" ", "T")).toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" }) : "";

async function api(ruta, opciones = {}) {
    const res = await fetch(API_CAJA + ruta, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...opciones,
        body: opciones.body ? JSON.stringify(opciones.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Error del servidor");
    return data;
}

// =========================================================
// ESTADO
// =========================================================
async function cargarEstado() {
    try {
        const data = await api("/actual");
        const abierta = data.abierta;

        $("panelApertura").hidden = abierta;
        $("panelOperacion").hidden = !abierta;
        $("estadoCaja").classList.toggle("abierta", abierta);

        if (abierta) {
            resumenActual = data.resumen;
            $("estadoBadge").innerHTML = `<i class="fas fa-lock-open"></i> Caja abierta`;
            $("estadoInfo").textContent = `Sesión #${data.sesion.id_sesion} · abierta el ${fecha(data.sesion.fecha_apertura)}`;
            pintarResumen(data.resumen);
            await Promise.all([cargarPendientes(), cargarMovimientos()]);
            recalcularArqueo();
        } else {
            resumenActual = null;
            $("estadoBadge").innerHTML = `<i class="fas fa-lock"></i> Caja cerrada`;
            $("estadoInfo").textContent = "Realice la apertura para comenzar a cobrar.";
        }
    } catch (e) {
        notificarSistema("No se pudo consultar la caja: " + e.message, "error");
    }
    cargarHistorial();
}

function pintarResumen(r) {
    $("kApertura").textContent = C(r.apertura);
    $("kIngresos").textContent = C(r.ingresos.total);
    $("kIngresosDet").textContent =
        `Efe. ${C(r.ingresos.EFECTIVO)} · Tarj. ${C(r.ingresos.TARJETA)} · Transf. ${C(r.ingresos.TRANSFERENCIA)}`;
    $("kEgresos").textContent = C(r.egresos.total);
    $("kEsperado").textContent = C(r.efectivoEsperado);
    $("aEsperado").textContent = C(r.efectivoEsperado);
}

// =========================================================
// 1. APERTURA
// =========================================================
$("formApertura").addEventListener("submit", async e => {
    e.preventDefault();
    try {
        const r = await api("/apertura", {
            method: "POST",
            body: { monto_apertura: $("monto_apertura").value, observaciones: $("obs_apertura").value }
        });
        notificarSistema(r.message, "exito");
        e.target.reset();
        cargarEstado();
    } catch (err) { notificarSistema(err.message, "error"); }
});

// =========================================================
// 2. PAGOS
// =========================================================
async function cargarPendientes() {
    pendientes = await api("/pendientes");
    const sel = $("pago_vehiculo");
    sel.innerHTML = `<option value="">${pendientes.length ? "Seleccione…" : "No hay servicios pendientes de cobro"}</option>` +
        pendientes.map(p => `<option value="${p.id_orden}">
            Orden #${p.id_orden} · ${esc(p.cliente)} · ${esc(p.Marca)} ${esc(p.Modelo)} — saldo ${C(p.saldo)}
        </option>`).join("");
    $("saldoBox").hidden = true;
}

$("pago_vehiculo").addEventListener("change", e => {
    const p = pendientes.find(x => x.id_orden == e.target.value);
    const box = $("saldoBox");
    if (!p) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `
        <div><span>Servicios</span><strong>${esc(p.Name_trabajo)}</strong></div>
        <div><span>Total</span><strong>${C(p.Total)}</strong></div>
        <div><span>Pagado</span><strong>${C(p.pagado)}</strong></div>
        <div><span>Saldo</span><strong class="rojo">${C(p.saldo)}</strong></div>`;
    $("pago_monto").value = Number(p.saldo).toFixed(2);
    $("pago_monto").max = p.saldo;
});

$("pago_metodo").addEventListener("change", e => {
    const requiere = e.target.value !== "EFECTIVO";
    $("campoReferencia").hidden = !requiere;
    $("pago_referencia").required = requiere;
});

$("formPago").addEventListener("submit", async e => {
    e.preventDefault();
    try {
        const r = await api("/pagos", {
            method: "POST",
            body: {
                id_orden: $("pago_vehiculo").value,
                monto: $("pago_monto").value,
                metodo_pago: $("pago_metodo").value,
                referencia: $("pago_referencia").value
            }
        });
        cargarCxc();
        notificarSistema(r.saldo_restante > 0
            ? `Pago registrado. Saldo restante: ${C(r.saldo_restante)}`
            : "Pago registrado. Servicio pagado por completo.", "exito");
        e.target.reset();
        $("campoReferencia").hidden = true;
        cargarEstado();
    } catch (err) { notificarSistema(err.message, "error"); }
});

// =========================================================
// EGRESOS
// =========================================================
$("formEgreso").addEventListener("submit", async e => {
    e.preventDefault();
    try {
        const r = await api("/egresos", {
            method: "POST",
            body: {
                concepto: $("egreso_concepto").value,
                monto: $("egreso_monto").value,
                metodo_pago: $("egreso_metodo").value
            }
        });
        notificarSistema(r.message, "exito");
        e.target.reset();
        cargarEstado();
    } catch (err) { notificarSistema(err.message, "error"); }
});

// =========================================================
// MOVIMIENTOS
// =========================================================
async function cargarMovimientos() {
    const movs = await api("/movimientos");
    const tbody = document.querySelector("#tablaMov tbody");
    if (!movs.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="vacio">Aún no hay movimientos en esta sesión</td></tr>`;
        return;
    }
    tbody.innerHTML = movs.map(m => `
        <tr>
            <td>${hora(m.fecha)}</td>
            <td><span class="tag ${m.tipo === "INGRESO" ? "in" : "out"}">${m.tipo === "INGRESO" ? "Ingreso" : "Egreso"}</span></td>
            <td>${esc(m.concepto)}${m.referencia ? `<br><small>Ref: ${esc(m.referencia)}</small>` : ""}</td>
            <td>${esc(m.cliente || "—")}</td>
            <td>${esc(m.metodo_pago)}</td>
            <td class="num ${m.tipo === "EGRESO" ? "rojo" : ""}">${m.tipo === "EGRESO" ? "−" : ""}${C(m.monto)}</td>
            <td><button class="btn-icon" title="Anular" data-permiso="caja.supervisar" data-anular="${m.id_mov}"><i class="fas fa-ban"></i></button></td>
        </tr>`).join("");
}

document.querySelector("#tablaMov tbody").addEventListener("click", async e => {
    const btn = e.target.closest("[data-anular]");
    if (!btn) return;
    if (!await confirmarSistema("¿Anular este movimiento? Se eliminará de la caja.", "Anular movimiento")) return;
    try {
        const r = await api(`/movimientos/${btn.dataset.anular}`, { method: "DELETE" });
        notificarSistema(r.message, "exito");
        cargarEstado();
    } catch (err) { notificarSistema(err.message, "error"); }
});

$("buscar").addEventListener("input", function () {
    const v = this.value.toLowerCase();
    document.querySelectorAll("#tablaMov tbody tr").forEach(tr =>
        tr.style.display = tr.innerText.toLowerCase().includes(v) ? "" : "none");
});

// =========================================================
// 3. ARQUEO / 4. CIERRE
// =========================================================
function construirDenominaciones() {
    $("denoms").innerHTML = DENOMINACIONES.map(d => `
        <label class="denom">
            <span>${d >= 10 ? "Billete" : "Moneda"} C$ ${d}</span>
            <input type="number" min="0" step="1" value="0" data-denom="${d}">
            <small data-sub="${d}">C$ 0.00</small>
        </label>`).join("");
    $("denoms").addEventListener("input", recalcularArqueo);
}

function leerDetalle() {
    const detalle = {};
    document.querySelectorAll("[data-denom]").forEach(i => {
        const n = parseInt(i.value, 10) || 0;
        if (n > 0) detalle[i.dataset.denom] = n;
    });
    return detalle;
}

function recalcularArqueo() {
    let contado = 0;
    document.querySelectorAll("[data-denom]").forEach(i => {
        const sub = Number(i.dataset.denom) * (parseInt(i.value, 10) || 0);
        contado += sub;
        document.querySelector(`[data-sub="${i.dataset.denom}"]`).textContent = C(sub);
    });
    const esperado = resumenActual ? resumenActual.efectivoEsperado : 0;
    const dif = Math.round((contado - esperado) * 100) / 100;
    $("aContado").textContent = C(contado);
    const d = $("aDiferencia");
    d.textContent = (dif > 0 ? "+" : "") + C(dif) + (dif > 0 ? " sobrante" : dif < 0 ? " faltante" : " cuadrada");
    d.className = dif === 0 ? "verde" : "rojo";
}

$("btnArqueo").addEventListener("click", async () => {
    try {
        const r = await api("/arqueo", { method: "POST", body: { detalle: leerDetalle() } });
        notificarSistema(`Arqueo guardado. Diferencia: ${C(r.diferencia)}`, r.diferencia === 0 ? "exito" : "advertencia");
    } catch (err) { notificarSistema(err.message, "error"); }
});

$("btnCierre").addEventListener("click", async () => {
    const detalle = leerDetalle();
    const contado = Object.entries(detalle).reduce((s, [v, n]) => s + v * n, 0);
    const esperado = resumenActual?.efectivoEsperado || 0;
    const dif = Math.round((contado - esperado) * 100) / 100;

    const msg = `Efectivo contado: <b>${C(contado)}</b><br>Esperado: <b>${C(esperado)}</b><br>` +
        (dif === 0 ? "La caja cuadra." : `Diferencia: <b>${C(dif)}</b> (${dif > 0 ? "sobrante" : "faltante"})`) +
        "<br><br>¿Cerrar la caja? Después no podrá registrar más pagos en esta sesión.";
    if (!await confirmarSistema(msg, "Cerrar caja")) return;

    try {
        const r = await api("/cierre", { method: "POST", body: { detalle, observaciones: $("obs_cierre").value } });
        notificarSistema(`Caja #${r.id_sesion} cerrada. Ya puede registrar el depósito del día.`, "exito", 6000);
        document.querySelectorAll("[data-denom]").forEach(i => i.value = 0);
        $("obs_cierre").value = "";
        cargarEstado();
    } catch (err) { notificarSistema(err.message, "error"); }
});

// =========================================================
// 5. HISTORIAL + DEPÓSITO
// =========================================================
async function cargarHistorial() {
    try {
        historial = await api("/historial");
    } catch { historial = []; }
    const tbody = document.querySelector("#tablaHist tbody");
    if (!historial.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="vacio">Sin sesiones registradas</td></tr>`;
        return;
    }
    tbody.innerHTML = historial.map(s => {
        const cerrada = s.estado === "CERRADA";
        const disponible = cerrada ? Number(s.efectivo_contado) - Number(s.depositado) : 0;
        const dif = Number(s.diferencia || 0);
        return `
        <tr>
            <td>${s.id_sesion}</td>
            <td>${fecha(s.fecha_apertura)}</td>
            <td>${cerrada ? fecha(s.fecha_cierre) : '<span class="tag in">Abierta</span>'}</td>
            <td class="num">${C(s.total_ingresos)}</td>
            <td class="num">${C(s.total_egresos)}</td>
            <td class="num">${cerrada ? C(s.efectivo_contado) : "—"}</td>
            <td class="num ${dif < 0 ? "rojo" : dif > 0 ? "verde" : ""}">${cerrada ? C(dif) : "—"}</td>
            <td class="num">${C(s.depositado)}</td>
            <td>${cerrada && disponible > 0.009
                ? `<button class="btn btn-mini" data-permiso="caja.supervisar" data-depositar="${s.id_sesion}"><i class="fas fa-building-columns"></i> Depositar</button>`
                : cerrada ? '<span class="tag ok">Depositado</span>' : ""}</td>
        </tr>`;
    }).join("");
}

document.querySelector("#tablaHist tbody").addEventListener("click", e => {
    const btn = e.target.closest("[data-depositar]");
    if (!btn) return;
    const s = historial.find(x => x.id_sesion == btn.dataset.depositar);
    const disponible = Number(s.efectivo_contado) - Number(s.depositado);
    depositoSesion = s.id_sesion;
    $("depSesion").textContent = s.id_sesion;
    $("depDisponible").textContent = C(disponible);
    $("dep_monto").value = disponible.toFixed(2);
    $("dep_monto").max = disponible.toFixed(2);
    $("modalDeposito").hidden = false;
});

$("btnCerrarModal").addEventListener("click", () => $("modalDeposito").hidden = true);

$("formDeposito").addEventListener("submit", async e => {
    e.preventDefault();
    try {
        const r = await api("/deposito", {
            method: "POST",
            body: {
                id_sesion: depositoSesion,
                banco: $("dep_banco").value,
                referencia: $("dep_referencia").value,
                monto: $("dep_monto").value
            }
        });
        notificarSistema(r.message, "exito");
        e.target.reset();
        $("modalDeposito").hidden = true;
        cargarHistorial();
    } catch (err) { notificarSistema(err.message, "error"); }
});

// =========================================================
// CUENTAS POR COBRAR (vehículos entregados con saldo)
// =========================================================
async function cargarCxc() {
    if (!puede("caja.cxc")) return;
    try {
        const rows = await api("/cuentas-por-cobrar");
        $("tablaCxc").innerHTML = rows.length ? rows.map(r => `
            <tr>
                <td><a href="ordenes.html?orden=${r.id_orden}">#${r.id_orden}</a></td>
                <td>${esc(r.cliente)}<br><small>${esc(r.celular)}</small></td>
                <td>${esc(r.Marca)} ${esc(r.Modelo)}</td>
                <td>${fecha(r.fecha_salida)}</td>
                <td class="num ${r.dias > 30 ? "rojo" : ""}">${r.dias}</td>
                <td class="num">${C(r.total)}</td>
                <td class="num rojo"><b>${C(r.saldo)}</b></td>
                <td><button class="btn btn-mini" data-permiso="caja.operar" data-cobrar="${r.id_orden}">Cobrar</button></td>
            </tr>`).join("") : `<tr><td colspan="8" class="vacio">No hay cuentas pendientes</td></tr>`;
    } catch (e) { notificarSistema(e.message, "error"); }
}

$("tablaCxc").addEventListener("click", e => {
    const b = e.target.closest("[data-cobrar]");
    if (!b) return;
    if (!resumenActual) return notificarSistema("Abra la caja para registrar el cobro", "advertencia");
    $("pago_vehiculo").value = b.dataset.cobrar;
    $("pago_vehiculo").dispatchEvent(new Event("change"));
    $("formPago").scrollIntoView({ behavior: "smooth", block: "center" });
});

// =========================================================
// INICIO
// =========================================================
construirDenominaciones();
window.sesionLista.then(() => {
    if (puede("caja.ver")) cargarEstado();
    cargarCxc();
});
