const API = "http://localhost:3000";
const form = document.getElementById("formServicio");

let editandoId = null;

// ================== HABILITAR / DESHABILITAR CAMPOS ==================
Compra_Externa.addEventListener("change", () => {
    Costo_Compra.disabled = !Compra_Externa.checked;
    if (!Compra_Externa.checked) Costo_Compra.value = "";
    calcularTotalEnTiempoReal();
});

Usa_Existencia.addEventListener("change", () => {
    Costo_Existencia.disabled = !Usa_Existencia.checked;
    if (!Usa_Existencia.checked) Costo_Existencia.value = "";
    calcularTotalEnTiempoReal();
});

Mano_Obra.addEventListener("change", () => {
    Costo_Mano_Obra.disabled = !Mano_Obra.checked;
    if (!Mano_Obra.checked) Costo_Mano_Obra.value = "";
    calcularTotalEnTiempoReal();
});

// ================== CALCULAR TOTAL EN TIEMPO REAL ==================
function calcularTotalEnTiempoReal() {
    const total = 
        (Compra_Externa.checked ? Number(Costo_Compra.value || 0) : 0) +
        (Usa_Existencia.checked ? Number(Costo_Existencia.value || 0) : 0) +
        (Mano_Obra.checked ? Number(Costo_Mano_Obra.value || 0) : 0);
    
    Total.value = total.toFixed(2);
}

// ================== ESCUCHAR CAMBIOS EN LOS INPUTS DE COSTO ==================
[Costo_Compra, Costo_Existencia, Costo_Mano_Obra].forEach(input => {
    input.addEventListener("input", calcularTotalEnTiempoReal);
});

// ================== CARGAR SERVICIOS ==================
function cargarServicios() {
    fetch(`${API}/trabajos`)
        .then(r => r.json())
        .then(data => {
            const tbody = document.querySelector("#tablaServicios tbody");
            tbody.innerHTML = "";

            data.forEach(s => {
                tbody.innerHTML += `
                <tr>
                    <td>${s.id_trabajo}</td>
                    <td>${s.Name_trabajo}</td>
                    <td>${s.Detalle_trab}</td>
                    <td>C$ ${Number(s.Total).toFixed(2)}</td>
                    <td>
                        <button class="btn-editar" data-permiso="catalogo.editar|catalogo.recetas" title="Editar / repuestos" onclick='editar(${JSON.stringify(s)})'><i class="fas fa-edit"></i></button>
                        <button class="btn-eliminar" data-permiso="catalogo.editar" onclick='eliminar(${s.id_trabajo})'><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`;
            });
        });
}

// ================== GUARDAR / ACTUALIZAR ==================
form.addEventListener("submit", e => {
    e.preventDefault();

    const data = {
        Name_trabajo: Name_trabajo.value,
        Detalle_trab: Detalle_trab.value,
        Compra_Externa: Compra_Externa.checked ? 1 : 0,
        Costo_Compra: Compra_Externa.checked ? Number(Costo_Compra.value || 0) : 0,
        Usa_Existencia: Usa_Existencia.checked ? 1 : 0,
        Costo_Existencia: Usa_Existencia.checked ? Number(Costo_Existencia.value || 0) : 0,
        Mano_Obra: Mano_Obra.checked ? 1 : 0,
        Costo_Mano_Obra: Mano_Obra.checked ? Number(Costo_Mano_Obra.value || 0) : 0
    };

    fetch(editandoId ? `${API}/trabajos/${editandoId}` : `${API}/trabajos`, {
        method: editandoId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
        .then(async res => ({ ok: res.ok, r: await res.json() }))
        .then(({ ok, r }) => {
            if (!ok) return notificarSistema(r.message || "Error al guardar el servicio", 'error');
            notificarSistema(r.message, 'exito');
            // El servicio recién guardado queda listo para asignarle repuestos
            cargarReceta(editandoId || r.id_trabajo, data.Name_trabajo);
            form.reset();
            editandoId = null;
            Total.value = "0.00"; // limpiar total
            cargarServicios();
        });
});

// ================== EDITAR ==================
function editar(s) {
    editandoId = s.id_trabajo;

    Name_trabajo.value = s.Name_trabajo;
    Detalle_trab.value = s.Detalle_trab;

    Compra_Externa.checked = s.Compra_Externa;
    Costo_Compra.disabled = !s.Compra_Externa;
    Costo_Compra.value = s.Costo_Compra;

    Usa_Existencia.checked = s.Usa_Existencia;
    Costo_Existencia.disabled = !s.Usa_Existencia;
    Costo_Existencia.value = s.Costo_Existencia;

    Mano_Obra.checked = s.Mano_Obra;
    Costo_Mano_Obra.disabled = !s.Mano_Obra;
    Costo_Mano_Obra.value = s.Costo_Mano_Obra;

    // Mostrar total en tiempo real
    calcularTotalEnTiempoReal();

    // Mostrar sus repuestos (receta)
    cargarReceta(s.id_trabajo, s.Name_trabajo);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ================== ELIMINAR ==================
async function eliminar(id) {
    const confirmado = await confirmarSistema("¿Eliminar este servicio?", "Eliminar servicio");
    if (!confirmado) return;

    fetch(`${API}/trabajos/${id}`, { method: "DELETE" })
        .then(async res => ({ ok: res.ok, r: await res.json() }))
        .then(({ ok, r }) => {
            notificarSistema(r.message, ok ? 'exito' : 'error');
            if (ok && recetaServicio == id) cargarReceta(null);
            cargarServicios();
        });
}

// =========================================================
// RECETA: repuestos del inventario que consume cada servicio
// Al crear una orden con este servicio, estos repuestos se copian a la orden
// y se descuentan del inventario cuando el trabajo inicia.
// =========================================================
let recetaServicio = null;       // id_trabajo cuya receta se está editando
let receta = [];                 // [{ id_producto, cantidad, nombre, ... }]
let productosInv = [];

const escR = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CR = n => "C$ " + Number(n || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function cargarProductosInv() {
    try {
        const res = await fetch(`${API}/productos`);
        productosInv = res.ok ? await res.json() : [];
    } catch { productosInv = []; }
}

async function cargarReceta(id_trabajo, nombre = "") {
    recetaServicio = id_trabajo || null;
    document.getElementById("recetaContenido").hidden = !recetaServicio;
    if (!recetaServicio) {
        document.getElementById("recetaAyuda").textContent =
            "Guarde o seleccione (editar) un servicio para asignarle repuestos del inventario.";
        return;
    }
    document.getElementById("recetaAyuda").innerHTML =
        `Servicio: <b>${escR(nombre)}</b>. Estos repuestos se descuentan del inventario cada vez que se realiza el servicio ` +
        `y están <b>incluidos en su precio</b>.`;
    try {
        const res = await fetch(`${API}/trabajos/${recetaServicio}/repuestos`);
        receta = res.ok ? (await res.json()).map(r => ({ ...r, cantidad: Number(r.cantidad) })) : [];
    } catch { receta = []; }
    pintarReceta();
}

function pintarReceta() {
    const tbody = document.getElementById("recetaItems");
    let costo = 0, venta = 0;
    tbody.innerHTML = receta.length ? receta.map((r, i) => {
        const p = productosInv.find(x => x.id_producto == r.id_producto) || r;
        costo += r.cantidad * Number(p.costo_promedio || 0);
        venta += r.cantidad * Number(p.precio_venta || 0);
        const bajo = Number(p.stock) < r.cantidad;
        return `<tr>
            <td><b>${escR(p.nombre)}</b> <small>(${escR(p.codigo)})</small></td>
            <td class="num">${r.cantidad} ${escR(p.unidad)}</td>
            <td class="num ${bajo ? "bajo" : ""}">${Number(p.stock)}</td>
            <td class="num">${CR(r.cantidad * Number(p.costo_promedio || 0))}</td>
            <td class="num">${CR(r.cantidad * Number(p.precio_venta || 0))}</td>
            <td><button type="button" class="x" data-quitar="${i}" title="Quitar"><i class="fas fa-times"></i></button></td>
        </tr>`;
    }).join("") + `<tr><td colspan="3"><b>Total repuestos</b></td><td class="num"><b>${CR(costo)}</b></td><td class="num"><b>${CR(venta)}</b></td><td></td></tr>`
      : `<tr><td colspan="6" class="receta-vacia">Este servicio no consume repuestos del inventario</td></tr>`;
    tbody.dataset.costo = costo;
    tbody.dataset.venta = venta;

    const usados = new Set(receta.map(r => Number(r.id_producto)));
    document.getElementById("recetaProducto").innerHTML = `<option value="">Repuesto del inventario…</option>` +
        productosInv.filter(p => !usados.has(p.id_producto))
            .map(p => `<option value="${p.id_producto}">${escR(p.nombre)} (${escR(p.codigo)}) — ${escR(p.unidad)}</option>`).join("");
}

document.getElementById("btnRecetaAgregar").addEventListener("click", () => {
    const id = Number(document.getElementById("recetaProducto").value);
    const cant = Number(document.getElementById("recetaCantidad").value);
    if (!id) return notificarSistema("Seleccione un repuesto", "error");
    if (!(cant > 0)) return notificarSistema("Indique la cantidad que usa el servicio", "error");
    const p = productosInv.find(x => x.id_producto === id);
    receta.push({ ...p, id_producto: id, cantidad: cant });
    document.getElementById("recetaCantidad").value = "";
    pintarReceta();
});

document.getElementById("recetaItems").addEventListener("click", e => {
    const b = e.target.closest("[data-quitar]");
    if (!b) return;
    receta.splice(Number(b.dataset.quitar), 1);
    pintarReceta();
});

document.getElementById("btnRecetaGuardar").addEventListener("click", async () => {
    try {
        const res = await fetch(`${API}/trabajos/${recetaServicio}/repuestos`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: receta.map(r => ({ id_producto: r.id_producto, cantidad: r.cantidad })) })
        });
        const r = await res.json();
        notificarSistema(r.message, res.ok ? "exito" : "error");
    } catch { notificarSistema("Error de conexión con el servidor", "error"); }
});

// Copia el valor de venta de los repuestos al campo "Costo existencia" del formulario
document.getElementById("btnUsarCosto").addEventListener("click", () => {
    if (editandoId != recetaServicio)
        return notificarSistema("Primero pulse Editar en este servicio para cambiar su precio", "advertencia");
    const venta = Number(document.getElementById("recetaItems").dataset.venta || 0);
    Usa_Existencia.checked = venta > 0;
    Costo_Existencia.disabled = !(venta > 0);
    Costo_Existencia.value = venta.toFixed(2);
    calcularTotalEnTiempoReal();
    notificarSistema("Costo de existencia actualizado. Guarde el servicio para aplicar el nuevo precio.", "info");
});

// ================== INICIALIZAR ==================
cargarProductosInv();
cargarServicios();