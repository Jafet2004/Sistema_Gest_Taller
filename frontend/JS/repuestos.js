// =========================================================
// INVENTARIO → Repuestos e insumos (stock, mínimos, ajustes, kardex)
// Va dentro de una función para no chocar con las variables de inv.js (herramientas).
// =========================================================
(() => {
    const API = "http://localhost:3000";
    let productos = [];
    let proveedores = [];
    let filtro = "todos";
    let editando = null;
    let ajustando = null;

    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const C = n => "C$ " + Number(n || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const N = n => Number(n || 0).toLocaleString("es-NI", { maximumFractionDigits: 2 });
    const fecha = s => s ? new Date(s.replace(" ", "T")).toLocaleString("es-NI", { dateStyle: "short", timeStyle: "short" }) : "";
    const TIPOS = { INICIAL: "Stock inicial", COMPRA: "Compra", SALIDA_ORDEN: "Salida a orden", DEVOLUCION_ORDEN: "Devolución de orden", AJUSTE: "Ajuste" };

    async function api(ruta, op = {}) {
        const res = await fetch(API + ruta, {
            credentials: "include", headers: { "Content-Type": "application/json" },
            ...op, body: op.body ? JSON.stringify(op.body) : undefined
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.error || "Error del servidor");
        return data;
    }

    // ---------- pestañas ----------
    document.querySelectorAll(".tab[data-tab]").forEach(t => t.addEventListener("click", () => {
        document.querySelectorAll(".tab[data-tab]").forEach(x => x.classList.toggle("activo", x === t));
        $("panel-repuestos").hidden = t.dataset.tab !== "repuestos";
        $("panel-herramientas").hidden = t.dataset.tab !== "herramientas";
        history.replaceState(null, "", "#" + t.dataset.tab);
    }));
    if (location.hash === "#herramientas") document.querySelector('[data-tab="herramientas"]').click();

    // ---------- carga ----------
    async function cargar() {
        try {
            [productos, proveedores] = await Promise.all([api("/productos"), api("/proveedores").catch(() => [])]);
        } catch (e) { return notificarSistema("No se pudo cargar el inventario: " + e.message, "error"); }
        pintar();
        const bajos = productos.filter(p => Number(p.bajo_minimo));
        $("alertaStock").hidden = !bajos.length;
        $("alertaTexto").innerHTML = `<b>${bajos.length} repuesto(s)</b> en o por debajo del stock mínimo: ` +
            bajos.slice(0, 4).map(p => esc(p.nombre)).join(", ") + (bajos.length > 4 ? "…" : "");
        $("cntBajo").hidden = !bajos.length;
        $("cntBajo").textContent = bajos.length;
        $("p_proveedor").innerHTML = `<option value="">— Sin proveedor —</option>` +
            proveedores.map(p => `<option value="${p.id_proveedor}">${esc(p.nombre)}</option>`).join("");
    }

    function pintar() {
        const q = $("buscarRep").value.trim().toLowerCase();
        const lista = productos.filter(p =>
            (filtro !== "bajo" || Number(p.bajo_minimo)) &&
            `${p.codigo} ${p.nombre} ${p.marca} ${p.proveedor}`.toLowerCase().includes(q));
        $("tablaRep").innerHTML = lista.length ? lista.map(p => {
            const bajo = Number(p.bajo_minimo), stock = Number(p.stock);
            return `
            <tr>
                <td><code>${esc(p.codigo)}</code></td>
                <td><b>${esc(p.nombre)}</b>${p.marca ? `<br><small>${esc(p.marca)}</small>` : ""}</td>
                <td>${esc(p.proveedor || "—")}</td>
                <td class="num"><span class="stock ${stock <= 0 ? "cero" : bajo ? "bajo" : ""}">${N(stock)}</span> <small>${esc(p.unidad)}</small></td>
                <td class="num">${N(p.stock_minimo)}</td>
                <td class="num">${C(p.costo_promedio)}</td>
                <td class="num">${C(p.precio_venta)}</td>
                <td>${bajo ? `<span class="badge bajo">Reabastecer</span>` : `<span class="badge ok">OK</span>`}
                    ${Number(p.en_pedido) > 0 ? `<br><span class="badge pedido">${N(p.en_pedido)} en pedido</span>` : ""}</td>
                <td class="CRUD">
                    <button class="btn-icon" title="Ajustar stock" data-permiso="inventario.editar" data-aj="${p.id_producto}"><i class="fas fa-scale-balanced"></i></button>
                    <button class="btn-icon" title="Kardex" data-kx="${p.id_producto}"><i class="fas fa-list-ul"></i></button>
                    <button class="btn-icon" title="Editar" data-permiso="inventario.editar" data-ed="${p.id_producto}"><i class="fas fa-pen"></i></button>
                    <button class="btn-icon" title="Eliminar" data-permiso="inventario.editar" data-del="${p.id_producto}"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join("") : `<tr><td colspan="9" class="vacio">${productos.length ? "Sin resultados" : "Aún no hay repuestos registrados"}</td></tr>`;
    }

    $("buscarRep").addEventListener("input", pintar);
    $("filtrosRep").addEventListener("click", e => {
        const b = e.target.closest("[data-f]");
        if (!b) return;
        filtro = b.dataset.f;
        $("filtrosRep").querySelectorAll(".filtro").forEach(x => x.classList.toggle("activo", x === b));
        pintar();
    });

    // ---------- crear / editar ----------
    function abrirForm(p = null) {
        editando = p ? p.id_producto : null;
        $("formProd").reset();
        $("prodTitulo").textContent = p ? `Editar ${p.nombre}` : "Nuevo repuesto";
        $("campoStockIni").hidden = !!p;
        $("hintCosto").hidden = !p;
        $("p_costo").disabled = !!p;
        if (p) {
            $("p_codigo").value = p.codigo; $("p_nombre").value = p.nombre; $("p_marca").value = p.marca || "";
            $("p_unidad").value = p.unidad; $("p_proveedor").value = p.id_proveedor || "";
            $("p_minimo").value = Number(p.stock_minimo); $("p_costo").value = Number(p.costo_promedio);
            $("p_precio").value = Number(p.precio_venta);
        }
        $("modalProd").hidden = false;
        $("p_codigo").focus();
    }
    $("btnNuevoRep").addEventListener("click", () => abrirForm());
    $("p_codigo").addEventListener("input", e => e.target.value = e.target.value.toUpperCase());

    $("formProd").addEventListener("submit", async e => {
        e.preventDefault();
        const body = {
            codigo: $("p_codigo").value, nombre: $("p_nombre").value, marca: $("p_marca").value,
            unidad: $("p_unidad").value, id_proveedor: $("p_proveedor").value || null,
            stock_minimo: $("p_minimo").value, costo_promedio: $("p_costo").value || 0,
            precio_venta: $("p_precio").value || 0, stock_inicial: $("p_stock_ini").value || 0
        };
        try {
            const r = editando
                ? await api(`/productos/${editando}`, { method: "PUT", body })
                : await api("/productos", { method: "POST", body });
            notificarSistema(r.message, "exito");
            $("modalProd").hidden = true;
            cargar();
        } catch (err) { notificarSistema(err.message, "error"); }
    });

    // ---------- acciones de la tabla ----------
    $("tablaRep").addEventListener("click", async e => {
        const b = e.target.closest("button");
        if (!b) return;
        const p = productos.find(x => x.id_producto == (b.dataset.aj || b.dataset.kx || b.dataset.ed || b.dataset.del));
        if (b.dataset.ed) abrirForm(p);
        if (b.dataset.aj) {
            ajustando = p.id_producto;
            $("formAjuste").reset();
            $("ajTitulo").textContent = `Ajuste — ${p.nombre}`;
            $("ajStock").textContent = `Stock actual: ${N(p.stock)} ${p.unidad}`;
            $("modalAjuste").hidden = false;
        }
        if (b.dataset.kx) verKardex(p);
        if (b.dataset.del) {
            if (!await confirmarSistema(`¿Eliminar ${esc(p.nombre)}? Si ya tiene movimientos se desactivará.`, "Eliminar repuesto")) return;
            try { notificarSistema((await api(`/productos/${p.id_producto}`, { method: "DELETE" })).message, "exito"); cargar(); }
            catch (err) { notificarSistema(err.message, "error"); }
        }
    });

    $("formAjuste").addEventListener("submit", async e => {
        e.preventDefault();
        try {
            const r = await api(`/productos/${ajustando}/ajuste`, {
                method: "POST", body: { cantidad: $("aj_cant").value, nota: $("aj_nota").value }
            });
            notificarSistema(`${r.message}. Nuevo stock: ${N(r.stock)}`, "exito");
            $("modalAjuste").hidden = true;
            cargar();
        } catch (err) { notificarSistema(err.message, "error"); }
    });

    async function verKardex(p) {
        $("kxTitulo").textContent = `Kardex — ${p.codigo} ${p.nombre}`;
        try {
            const movs = await api(`/productos/${p.id_producto}/kardex`);
            $("kxBody").innerHTML = movs.length ? movs.map(m => `
                <tr>
                    <td>${fecha(m.fecha)}</td>
                    <td>${TIPOS[m.tipo] || m.tipo}${m.nota ? `<br><small>${esc(m.nota)}</small>` : ""}</td>
                    <td>${m.id_orden ? `<a href="ordenes.html?orden=${m.id_orden}">Orden #${m.id_orden}</a>`
                        : m.id_compra ? `<a href="compras.html?compra=${m.id_compra}">Compra #${m.id_compra}</a>` : "—"}</td>
                    <td class="num ${Number(m.cantidad) < 0 ? "rojo" : "verde"}">${Number(m.cantidad) > 0 ? "+" : ""}${N(m.cantidad)}</td>
                    <td class="num">${C(m.costo_unit)}</td>
                    <td class="num"><b>${N(m.stock_resultante)}</b></td>
                </tr>`).join("") : `<tr><td colspan="6" class="vacio">Sin movimientos</td></tr>`;
            $("modalKardex").hidden = false;
        } catch (err) { notificarSistema(err.message, "error"); }
    }

    document.querySelectorAll("[data-cerrar]").forEach(b =>
        b.addEventListener("click", () => b.closest(".modal").hidden = true));

    window.sesionLista.then(() => {
        if (!puede("inventario.ver")) {             // solo herramientas
            document.querySelector('[data-tab="herramientas"]').click();
            return;
        }
        cargar();
    });
})();
