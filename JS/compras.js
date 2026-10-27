// =========================================================
// COMPRAS Y PROVEEDORES
//   Reabastecer (stock mínimo) → Pedido BORRADOR → ENVIADA → RECIBIDA (entra a inventario)
//   compras.html?compra=ID abre ese pedido
// =========================================================
const API = "http://localhost:3000";

let productos = [], proveedores = [], sugerencias = [];
let filtroCompra = "abiertas";
let compra = null;          // pedido abierto en el modal
let recibiendo = false;
let editandoProv = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const C = n => "C$ " + Number(n || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const N = n => Number(n || 0).toLocaleString("es-NI", { maximumFractionDigits: 2 });
const fecha = s => s ? new Date(s.replace(" ", "T")).toLocaleDateString("es-NI") : "—";
const ESTADOS = { BORRADOR: "Borrador", ENVIADA: "Enviada", RECIBIDA: "Recibida", CANCELADA: "Cancelada" };

async function api(ruta, op = {}) {
    const res = await fetch(API + ruta, {
        credentials: "include", headers: { "Content-Type": "application/json" },
        ...op, body: op.body ? JSON.stringify(op.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || "Error del servidor");
    return data;
}

const opcionesProveedor = (sel, vacio = "Seleccione…") =>
    `<option value="">${vacio}</option>` + proveedores.map(p =>
        `<option value="${p.id_proveedor}" ${p.id_proveedor == sel ? "selected" : ""}>${esc(p.nombre)}</option>`).join("");

// ---------- pestañas ----------
function irTab(nombre) {
    document.querySelectorAll(".tab[data-tab]").forEach(x => x.classList.toggle("activo", x.dataset.tab === nombre));
    ["reabastecer", "pedidos", "proveedores"].forEach(t => $("panel-" + t).hidden = t !== nombre);
}
document.querySelectorAll(".tab[data-tab]").forEach(t => t.addEventListener("click", () => irTab(t.dataset.tab)));

// =========================================================
// REABASTECER
// =========================================================
async function cargarSugerencias() {
    sugerencias = await api("/compras/sugerencias");
    $("cntSug").hidden = !sugerencias.length;
    $("cntSug").textContent = sugerencias.length;
    $("tablaSug").innerHTML = sugerencias.length ? sugerencias.map(s => `
        <tr data-id="${s.id_producto}">
            <td><input type="checkbox" class="chk" ${s.sugerido > 0 ? "checked" : ""}></td>
            <td><b>${esc(s.nombre)}</b><br><small>${esc(s.codigo)}</small></td>
            <td class="num"><span class="stock ${Number(s.stock) <= 0 ? "cero" : "bajo"}">${N(s.stock)}</span> <small>${esc(s.unidad)}</small></td>
            <td class="num">${N(s.stock_minimo)}</td>
            <td class="num">${Number(s.en_pedido) > 0 ? `<span class="badge pedido">${N(s.en_pedido)}</span>` : "—"}</td>
            <td><select class="prov">${opcionesProveedor(s.id_proveedor, "— Elegir —")}</select></td>
            <td class="num"><input type="number" class="cant num-input" min="0" step="1" value="${s.sugerido}"></td>
            <td class="num"><input type="number" class="costo num-input" min="0" step="0.01" value="${Number(s.costo_promedio)}"></td>
            <td class="num sub"></td>
        </tr>`).join("")
        : `<tr><td colspan="9" class="vacio"><i class="fas fa-circle-check" style="color:var(--verde)"></i> Todo el inventario está sobre el mínimo</td></tr>`;
    totalSugerencias();
}

function totalSugerencias() {
    let total = 0, n = 0;
    $("tablaSug").querySelectorAll("tr[data-id]").forEach(tr => {
        const sub = Number(tr.querySelector(".cant").value) * Number(tr.querySelector(".costo").value);
        tr.querySelector(".sub").textContent = C(sub);
        if (tr.querySelector(".chk").checked) { total += sub; n++; }
    });
    $("totalSug").textContent = n ? `${n} repuesto(s) seleccionados · total estimado ${C(total)}` : "";
}
$("tablaSug").addEventListener("input", totalSugerencias);
$("tablaSug").addEventListener("change", totalSugerencias);
$("chkTodos").addEventListener("change", e => {
    $("tablaSug").querySelectorAll(".chk").forEach(c => c.checked = e.target.checked);
    totalSugerencias();
});

$("btnGenerar").addEventListener("click", async () => {
    const items = [...$("tablaSug").querySelectorAll("tr[data-id]")]
        .filter(tr => tr.querySelector(".chk").checked && Number(tr.querySelector(".cant").value) > 0)
        .map(tr => ({
            id_producto: Number(tr.dataset.id),
            id_proveedor: tr.querySelector(".prov").value,
            cantidad: tr.querySelector(".cant").value,
            costo_unit: tr.querySelector(".costo").value
        }));
    if (!items.length) return notificarSistema("Seleccione al menos un repuesto con cantidad", "error");
    if (items.some(i => !i.id_proveedor)) return notificarSistema("Elija el proveedor de cada repuesto seleccionado", "error");
    try {
        const r = await api("/compras/generar", { method: "POST", body: { items } });
        notificarSistema(`${r.message}. Revíselos y márquelos como enviados.`, "exito", 6000);
        await Promise.all([cargarSugerencias(), cargarCompras()]);
        irTab("pedidos");
    } catch (err) { notificarSistema(err.message, "error"); }
});

$("btnCompraDirecta").addEventListener("click", () => abrirCompra(null));

// =========================================================
// PEDIDOS
// =========================================================
$("filtrosCompra").addEventListener("click", e => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    filtroCompra = b.dataset.f;
    $("filtrosCompra").querySelectorAll(".filtro").forEach(x => x.classList.toggle("activo", x === b));
    cargarCompras();
});

async function cargarCompras() {
    const lista = await api(`/compras?estado=${filtroCompra}`);
    if (filtroCompra === "abiertas") {
        $("cntAbiertas").hidden = !lista.length;
        $("cntAbiertas").textContent = lista.length;
    }
    $("tablaCompras").innerHTML = lista.length ? lista.map(c => `
        <tr>
            <td>${c.id_compra}</td>
            <td>${fecha(c.fecha)}</td>
            <td>${esc(c.proveedor)}</td>
            <td class="num">${c.items}</td>
            <td class="num">${C(c.total)}</td>
            <td>${esc(c.numero_factura || "—")}</td>
            <td><span class="estado ${c.estado}">${ESTADOS[c.estado]}</span></td>
            <td><button class="btn btn-mini" data-ver="${c.id_compra}">Ver</button></td>
        </tr>`).join("") : `<tr><td colspan="8" class="vacio">No hay pedidos</td></tr>`;
}
$("tablaCompras").addEventListener("click", e => {
    const b = e.target.closest("[data-ver]");
    if (b) abrirCompra(b.dataset.ver);
});

// ---------- modal de pedido ----------
async function abrirCompra(id) {
    recibiendo = false;
    try {
        if (id) {
            const c = await api(`/compras/${id}`);
            compra = { ...c, lineas: c.detalle.map(d => ({ ...d, cantidad: Number(d.cantidad), costo_unit: Number(d.costo_unit) })) };
        } else {
            compra = { id_compra: null, estado: "BORRADOR", id_proveedor: "", observaciones: "", lineas: [] };
        }
    } catch (err) { return notificarSistema(err.message, "error"); }
    $("cFactura").value = compra.numero_factura || "";
    $("cPagarCaja").checked = false;
    $("cMetodoCampo").hidden = $("cRefCampo").hidden = true;
    pintarCompra();
    $("modalCompra").hidden = false;
}

function pintarCompra() {
    const c = compra;
    const editable = c.estado === "BORRADOR" && !recibiendo && puede("compras.editar");
    $("cTitulo").textContent = c.id_compra ? `Pedido de compra #${c.id_compra}` : "Nueva compra";
    $("cEstado").className = `estado ${c.estado}`;
    $("cEstado").textContent = ESTADOS[c.estado];
    $("cProveedor").innerHTML = opcionesProveedor(c.id_proveedor);
    $("cProveedor").disabled = !editable;
    $("cObs").value = c.observaciones || "";
    $("cObs").disabled = !editable;
    $("cAgregar").hidden = !editable;
    $("cRecepcion").hidden = !recibiendo;

    const recibida = c.estado === "RECIBIDA";
    $("cHead").innerHTML = recibiendo || recibida
        ? `<tr><th>Repuesto</th><th class="num">Pedido</th><th class="num">Recibido</th><th class="num">Costo real</th><th class="num">Subtotal</th></tr>`
        : `<tr><th>Repuesto</th><th class="num">Stock</th><th class="num">Cantidad</th><th class="num">Costo unit.</th><th class="num">Subtotal</th><th></th></tr>`;

    let total = 0;
    $("cItems").innerHTML = c.lineas.map((l, i) => {
        const cant = recibiendo ? (l.recibir ?? l.cantidad) : recibida ? Number(l.cantidad_recibida ?? l.cantidad) : l.cantidad;
        const sub = Number(cant) * Number(l.costo_unit);
        total += sub;
        const nombre = `<b>${esc(l.nombre)}</b><br><small>${esc(l.codigo)} · ${esc(l.unidad)}</small>`;
        if (recibiendo) return `
            <tr data-i="${i}">
                <td>${nombre}</td><td class="num">${N(l.cantidad)}</td>
                <td class="num"><input type="number" class="num-input rec" min="0" step="0.01" value="${cant}"></td>
                <td class="num"><input type="number" class="num-input cst" min="0" step="0.01" value="${l.costo_unit}"></td>
                <td class="num">${C(sub)}</td></tr>`;
        if (recibida) return `
            <tr><td>${nombre}</td><td class="num">${N(l.cantidad)}</td><td class="num">${N(cant)}</td>
                <td class="num">${C(l.costo_unit)}</td><td class="num">${C(sub)}</td></tr>`;
        return `
            <tr data-i="${i}">
                <td>${nombre}</td><td class="num">${N(l.stock)}</td>
                <td class="num">${editable ? `<input type="number" class="num-input cant" min="0.01" step="0.01" value="${l.cantidad}">` : N(l.cantidad)}</td>
                <td class="num">${editable ? `<input type="number" class="num-input cst" min="0" step="0.01" value="${l.costo_unit}">` : C(l.costo_unit)}</td>
                <td class="num">${C(sub)}</td>
                <td>${editable ? `<button class="btn-icon" data-quitar="${i}" title="Quitar"><i class="fas fa-trash"></i></button>` : ""}</td>
            </tr>`;
    }).join("") + (c.lineas.length
        ? `<tr class="fila-total"><td colspan="4">Total</td><td class="num">${C(total)}</td>${recibiendo || recibida ? "" : "<td></td>"}</tr>`
        : `<tr><td colspan="6" class="vacio">Agregue repuestos al pedido</td></tr>`);

    // productos que se pueden agregar (los que no están ya en el pedido)
    const usados = new Set(c.lineas.map(l => Number(l.id_producto)));
    $("cNuevoProd").innerHTML = `<option value="">Seleccione…</option>` + productos
        .filter(p => !usados.has(p.id_producto))
        .map(p => `<option value="${p.id_producto}">${esc(p.nombre)} (${esc(p.codigo)}) — stock ${N(p.stock)} ${esc(p.unidad)}</option>`).join("");

    // botones según el estado y los permisos del usuario
    const b = [];
    const edita = puede("compras.editar");
    if (c.requiere_aprobacion) {
        b.push(`<span class="badge bajo" style="margin-right:auto">Requiere aprobación (límite ${C(c.limite_aprobacion)})</span>`);
        if (puede("compras.aprobar"))
            b.push(`<button class="btn btn-rojo" data-acc="aprobar"><i class="fas fa-stamp"></i> Aprobar compra</button>`);
    } else if (c.aprobada_por) {
        b.push(`<span class="badge ok" style="margin-right:auto">Aprobada por ${esc(c.aprobada_por_nombre)}</span>`);
    }
    if (!edita && !["RECIBIDA"].includes(c.estado)) {
        // solo lectura (y quizá aprobar)
    } else if (recibiendo) {
        b.push(`<button class="btn btn-gris" data-acc="volver">Atrás</button>`,
               `<button class="btn btn-rojo" data-acc="confirmar"><i class="fas fa-check"></i> Confirmar recepción</button>`);
    } else if (c.estado === "BORRADOR" && !c.requiere_aprobacion) {
        if (c.id_compra) b.push(`<button class="btn btn-gris" data-acc="cancelar"><i class="fas fa-ban"></i> Cancelar pedido</button>`);
        b.push(`<button class="btn btn-gris" data-acc="guardar"><i class="fas fa-save"></i> Guardar borrador</button>`);
        if (c.id_compra) b.push(`<button class="btn btn-gris" data-acc="enviar"><i class="fas fa-paper-plane"></i> Marcar enviado</button>`);
        b.push(`<button class="btn btn-rojo" data-acc="recibir"><i class="fas fa-dolly"></i> ${c.id_compra ? "Recibir" : "Guardar y recibir ahora"}</button>`);
    } else if (c.estado === "BORRADOR") {
        b.push(`<button class="btn btn-gris" data-acc="cancelar"><i class="fas fa-ban"></i> Cancelar pedido</button>`,
               `<button class="btn btn-gris" data-acc="guardar"><i class="fas fa-save"></i> Guardar borrador</button>`);
    } else if (c.estado === "ENVIADA") {
        b.push(`<button class="btn btn-gris" data-acc="cancelar"><i class="fas fa-ban"></i> Cancelar pedido</button>`,
               `<button class="btn btn-gris" data-acc="borrador"><i class="fas fa-rotate-left"></i> Volver a borrador</button>`,
               `<button class="btn btn-rojo" data-acc="recibir"><i class="fas fa-dolly"></i> Recibir</button>`);
    } else if (c.estado === "RECIBIDA") {
        b.push(`<span class="hint">Recibida el ${fecha(c.fecha_recepcion)}${c.numero_factura ? ` · factura ${esc(c.numero_factura)}` : ""}${Number(c.pagado_caja) > 0 ? ` · pagada desde caja ${C(c.pagado_caja)}` : ""}</span>`);
        if (puede("compras.pagar") && Number(c.pagado_caja) < Number(c.total) - 0.009)
            b.push(`<select id="cMetodoPago" style="width:auto"><option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta</option><option value="TRANSFERENCIA">Transferencia</option></select>`,
                   `<input id="cRefPago" placeholder="Referencia" style="width:140px">`,
                   `<button class="btn btn-rojo" data-acc="pagar"><i class="fas fa-money-bill-wave"></i> Pagar ${C(Number(c.total) - Number(c.pagado_caja))} desde caja</button>`);
    }
    $("cAcciones").innerHTML = b.join("");
}

// Edición de líneas (guarda los valores en memoria al teclear)
$("cItems").addEventListener("change", e => {
    const tr = e.target.closest("tr[data-i]");
    if (!tr) return;
    const l = compra.lineas[tr.dataset.i];
    if (e.target.classList.contains("cant")) l.cantidad = Number(e.target.value);
    if (e.target.classList.contains("cst")) l.costo_unit = Number(e.target.value);
    if (e.target.classList.contains("rec")) l.recibir = Number(e.target.value);
    pintarCompra();
});
$("cItems").addEventListener("click", e => {
    const b = e.target.closest("[data-quitar]");
    if (!b) return;
    compra.lineas.splice(Number(b.dataset.quitar), 1);
    pintarCompra();
});
$("cProveedor").addEventListener("change", e => compra.id_proveedor = e.target.value);
$("cObs").addEventListener("change", e => compra.observaciones = e.target.value);

$("btnAgregarLinea").addEventListener("click", () => {
    const p = productos.find(x => x.id_producto == $("cNuevoProd").value);
    if (!p) return notificarSistema("Seleccione un repuesto", "error");
    compra.lineas.push({ id_producto: p.id_producto, codigo: p.codigo, nombre: p.nombre, unidad: p.unidad,
                         stock: p.stock, cantidad: 1, costo_unit: Number(p.costo_promedio) });
    if (!compra.id_proveedor && p.id_proveedor) compra.id_proveedor = p.id_proveedor;
    pintarCompra();
});

$("cPagarCaja").addEventListener("change", e => {
    $("cMetodoCampo").hidden = !e.target.checked;
    $("cRefCampo").hidden = !e.target.checked || $("cMetodo").value === "EFECTIVO";
});
$("cMetodo").addEventListener("change", e => $("cRefCampo").hidden = e.target.value === "EFECTIVO");

async function guardar() {
    const body = {
        id_proveedor: compra.id_proveedor, observaciones: compra.observaciones,
        items: compra.lineas.map(l => ({ id_producto: l.id_producto, cantidad: l.cantidad, costo_unit: l.costo_unit }))
    };
    if (!body.id_proveedor) throw new Error("Seleccione el proveedor");
    if (compra.id_compra) {
        await api(`/compras/${compra.id_compra}`, { method: "PUT", body });
        return compra.id_compra;
    }
    const r = await api("/compras", { method: "POST", body });
    return r.id_compra;
}

$("cAcciones").addEventListener("click", async e => {
    const acc = e.target.closest("[data-acc]")?.dataset.acc;
    if (!acc) return;
    try {
        if (acc === "guardar") {
            const id = await guardar();
            notificarSistema("Pedido guardado", "exito");
            await abrirCompra(id);
        }
        if (acc === "enviar" || acc === "borrador") {
            if (acc === "enviar") await guardar();
            const r = await api(`/compras/${compra.id_compra}/estado`, { method: "PUT", body: { estado: acc === "enviar" ? "ENVIADA" : "BORRADOR" } });
            notificarSistema(r.message, "exito");
            await abrirCompra(compra.id_compra);
        }
        if (acc === "cancelar") {
            if (!await confirmarSistema("¿Cancelar este pedido de compra?", "Cancelar pedido")) return;
            const r = await api(`/compras/${compra.id_compra}/estado`, { method: "PUT", body: { estado: "CANCELADA" } });
            notificarSistema(r.message, "exito");
            $("modalCompra").hidden = true;
        }
        if (acc === "recibir") {
            if (compra.estado === "BORRADOR") {
                const id = await guardar();
                await abrirCompra(id);
            }
            recibiendo = true;
            pintarCompra();
            $("cFactura").focus();
            return;
        }
        if (acc === "volver") { recibiendo = false; pintarCompra(); return; }
        if (acc === "aprobar") {
            const r = await api(`/compras/${compra.id_compra}/aprobar`, { method: "PUT" });
            notificarSistema(r.message, "exito");
            await abrirCompra(compra.id_compra);
        }
        if (acc === "pagar") {
            if (!await confirmarSistema("Se registrará un <b>egreso en la caja abierta</b> por el saldo de esta compra.", "Pagar compra")) return;
            const r = await api(`/compras/${compra.id_compra}/pagar`, { method: "POST",
                body: { metodo_pago: $("cMetodoPago").value, referencia: $("cRefPago").value } });
            notificarSistema(r.message, "exito");
            await abrirCompra(compra.id_compra);
        }
        if (acc === "confirmar") {
            const total = compra.lineas.reduce((s, l) => s + Number(l.recibir ?? l.cantidad) * Number(l.costo_unit), 0);
            const pagar = $("cPagarCaja").checked;
            if (!await confirmarSistema(
                `Ingresarán al inventario los productos recibidos por un total de <b>${C(total)}</b>.` +
                (pagar ? `<br>Se registrará un <b>egreso en la caja</b> por ese monto.` : ""), "Confirmar recepción")) return;
            const r = await api(`/compras/${compra.id_compra}/recibir`, {
                method: "POST",
                body: {
                    numero_factura: $("cFactura").value,
                    pagar_con_caja: pagar,
                    metodo_pago: $("cMetodo").value,
                    referencia: $("cReferencia").value,
                    items: compra.lineas.map(l => ({ id_detalle: l.id_detalle, cantidad_recibida: l.recibir ?? l.cantidad, costo_unit: l.costo_unit }))
                }
            });
            notificarSistema(r.message, "exito", 6000);
            $("modalCompra").hidden = true;
        }
        await Promise.all([cargarCompras(), cargarSugerencias(), cargarProductos()]);
    } catch (err) { notificarSistema(err.message, "error"); }
});

// =========================================================
// PROVEEDORES
// =========================================================
async function cargarProveedores() {
    proveedores = await api("/proveedores");
    $("tablaProv").innerHTML = proveedores.length ? proveedores.map(p => `
        <tr>
            <td><b>${esc(p.nombre)}</b>${p.direccion ? `<br><small>${esc(p.direccion)}</small>` : ""}</td>
            <td>${esc(p.contacto || "—")}</td>
            <td>${esc(p.telefono || "—")}</td>
            <td>${esc(p.email || "—")}</td>
            <td class="num">${p.productos}</td>
            <td class="num">${p.compras}</td>
            <td class="CRUD">
                <button class="btn-icon" title="Editar" data-permiso="compras.editar" data-ed="${p.id_proveedor}"><i class="fas fa-pen"></i></button>
                <button class="btn-icon" title="Eliminar" data-permiso="compras.editar" data-del="${p.id_proveedor}"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join("") : `<tr><td colspan="7" class="vacio">Registre su primer proveedor</td></tr>`;
}

function limpiarProv() {
    editandoProv = null;
    $("formProv").reset();
    $("btnGuardarProv").innerHTML = `<i class="fas fa-save"></i> Registrar proveedor`;
    $("btnCancelarProv").hidden = true;
}
$("btnCancelarProv").addEventListener("click", limpiarProv);

$("formProv").addEventListener("submit", async e => {
    e.preventDefault();
    const body = { nombre: $("pv_nombre").value, contacto: $("pv_contacto").value, telefono: $("pv_telefono").value,
                   email: $("pv_email").value, direccion: $("pv_direccion").value };
    try {
        const r = editandoProv
            ? await api(`/proveedores/${editandoProv}`, { method: "PUT", body })
            : await api("/proveedores", { method: "POST", body });
        notificarSistema(r.message, "exito");
        limpiarProv();
        await cargarProveedores();
        cargarSugerencias();
    } catch (err) { notificarSistema(err.message, "error"); }
});

$("tablaProv").addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b) return;
    const p = proveedores.find(x => x.id_proveedor == (b.dataset.ed || b.dataset.del));
    if (b.dataset.ed) {
        editandoProv = p.id_proveedor;
        $("pv_nombre").value = p.nombre; $("pv_contacto").value = p.contacto || "";
        $("pv_telefono").value = p.telefono || ""; $("pv_email").value = p.email || "";
        $("pv_direccion").value = p.direccion || "";
        $("btnGuardarProv").innerHTML = `<i class="fas fa-save"></i> Guardar cambios`;
        $("btnCancelarProv").hidden = false;
        $("pv_nombre").focus();
    }
    if (b.dataset.del) {
        if (!await confirmarSistema(`¿Eliminar a ${esc(p.nombre)}? Si tiene compras se desactivará.`, "Eliminar proveedor")) return;
        try { notificarSistema((await api(`/proveedores/${p.id_proveedor}`, { method: "DELETE" })).message, "exito"); cargarProveedores(); }
        catch (err) { notificarSistema(err.message, "error"); }
    }
});

// =========================================================
// INICIO
// =========================================================
async function cargarProductos() { productos = await api("/productos"); }

document.querySelectorAll("[data-cerrar]").forEach(b => b.addEventListener("click", () => {
    b.closest(".modal").hidden = true;
    history.replaceState(null, "", location.pathname);
}));

(async () => {
    try {
        await window.sesionLista;
        await Promise.all([cargarProveedores(), cargarProductos()]);
        await Promise.all([cargarSugerencias(), cargarCompras()]);
        const id = new URLSearchParams(location.search).get("compra");
        if (id) { irTab("pedidos"); abrirCompra(id); }
        else if (!sugerencias.length) irTab("pedidos");
    } catch (err) { notificarSistema("No se pudo cargar: " + err.message, "error"); }
})();
