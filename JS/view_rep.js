// ===============================
// CONFIG
// ===============================
// Backend corre en un puerto distinto al de Live Server / servidor estático
const API_BASE = "http://localhost:3000";
const API = `${API_BASE}/reportes`;
const API_CLIENTES = `${API_BASE}/clientes`;
const API_VEHICULOS = `${API_BASE}/vehiculos`;
const API_TRABAJOS = `${API_BASE}/trabajos`;

// ===============================
// ELEMENTOS
// ===============================
const form = document.getElementById("reportForm");
const btnCancelar = document.getElementById("btn-cancelar");
const btnPrintAll = document.getElementById("btn-imprimir-lista");
const btnRefrescar = document.getElementById("btn-refrescar");
const btnText = document.getElementById("btn-text");

const select_cliente = document.getElementById("select_cliente");
const select_vehiculo = document.getElementById("select_vehiculo");
const select_trabajo = document.getElementById("select_trabajo");
const fecha_reporte = document.getElementById("fecha_reporte");
const observaciones = document.getElementById("observaciones");
const recomendaciones = document.getElementById("recomendaciones");

let editMode = false;
let editId = null;

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
    cargarSelects();
    cargarReportes();
});

// ===============================
// EVENTOS
// ===============================
btnCancelar.addEventListener("click", resetForm);
btnPrintAll.addEventListener("click", imprimirListaCompleta);
btnRefrescar.addEventListener("click", cargarReportes);

document.getElementById("buscar").addEventListener("input", function () {
    const texto = this.value.toLowerCase();
    document.querySelectorAll("#tablaReportes tbody tr").forEach(tr => {
        tr.style.display = tr.innerText.toLowerCase().includes(texto) ? "" : "none";
    });
});

// ===============================
// CARGAR SELECTS
// ===============================
async function cargarSelects() {
    try {
        // CLIENTES
        const clientes = await (await fetch(API_CLIENTES)).json();
        const selCliente = document.getElementById("select_cliente");
        selCliente.innerHTML = "<option value=''>Seleccione Cliente</option>";
        clientes.forEach(c => {
            selCliente.innerHTML += `
                <option value="${c.id_client}">
                    ${c.pr_name} ${c.pr_lastname}
                </option>`;
        });

        // VEHICULOS
        const vehiculos = await (await fetch(API_VEHICULOS)).json();
        const selVehiculo = document.getElementById("select_vehiculo");
        selVehiculo.innerHTML = "<option value=''>Seleccione Vehículo</option>";
        vehiculos.forEach(v => {
            selVehiculo.innerHTML += `
                <option value="${v.id_Vehic}">
                    ${v.Marca} ${v.Modelo}
                </option>`;
        });

        // TRABAJOS
        const trabajos = await (await fetch(API_TRABAJOS)).json();
        const selTrabajo = document.getElementById("select_trabajo");
        selTrabajo.innerHTML = "<option value=''>Seleccione Trabajo</option>";
        trabajos.forEach(t => {
            selTrabajo.innerHTML += `
                <option value="${t.id_trabajo}">
                    ${t.Name_trabajo} - C$ ${t.Total}
                </option>`;
        });

    } catch (err) {
        console.error("Error cargando selects", err);
    }
}

// ===============================
// CARGAR REPORTES
// ===============================
async function cargarReportes() {
    try {
        const reportes = await (await fetch(API)).json();
        const tbody = document.querySelector("#tablaReportes tbody");
        tbody.innerHTML = "";

        reportes.forEach(r => {
            const fecha = r.fecha_reporte
                ? new Date(r.fecha_reporte).toLocaleString()
                : "";

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${r.id_reporte}</td>
                <td>${r.pr_name} ${r.pr_lastname}</td>
                <td>${r.Marca} ${r.Modelo}</td>
                <td>${r.Name_trabajo}</td>
                <td>${fecha}</td>
                <td class="CRUD">
                    <button class="btn-editar" data-id="${r.id_reporte}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-eliminar" data-id="${r.id_reporte}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                    <button class="btn-print" data-id="${r.id_reporte}">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // EVENTOS BOTONES
        document.querySelectorAll(".btn-eliminar").forEach(b =>
            b.addEventListener("click", () => eliminarReporte(b.dataset.id))
        );

        document.querySelectorAll(".btn-editar").forEach(b =>
            b.addEventListener("click", () => cargarReporteEditar(b.dataset.id))
        );

        document.querySelectorAll(".btn-print").forEach(b =>
            b.addEventListener("click", () => imprimirReporte(b.dataset.id))
        );

    } catch (err) {
        console.error("Error cargando reportes", err);
    }
}

// ===============================
// GUARDAR / ACTUALIZAR
// ===============================
form.addEventListener("submit", async e => {
    e.preventDefault();

    const payload = {
        id_client: select_cliente.value,
        id_Vehic: select_vehiculo.value,
        id_trabajo: select_trabajo.value,
        fecha_reporte: fecha_reporte.value.replace("T", " ") + ":00",
        observaciones: observaciones.value,
        recomendaciones: recomendaciones.value
    };

    try {
        let res;
        if (editMode) {
            res = await fetch(`${API}/${editId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) throw new Error("Error al guardar");

        const eraEdicion = editMode;
        resetForm();
        cargarReportes();
        notificarSistema(
            eraEdicion ? 'Reporte actualizado correctamente' : 'Reporte guardado correctamente',
            'exito'
        );

    } catch (err) {
        notificarSistema("Error al guardar reporte", "error");
    }
});

// ===============================
// ELIMINAR
// ===============================
async function eliminarReporte(id) {
    const confirmado = await confirmarSistema("¿Eliminar este reporte?", "Eliminar reporte");
    if (!confirmado) return;
    await fetch(`${API}/${id}`, { method: "DELETE" });
    cargarReportes();
    notificarSistema("Reporte eliminado correctamente", "exito");
}

// ===============================
// EDITAR
// ===============================
async function cargarReporteEditar(id) {
    const r = await (await fetch(`${API}/${id}`)).json();

    select_cliente.value = r.id_client;
    select_vehiculo.value = r.id_Vehic;
    select_trabajo.value = r.id_trabajo;
    fecha_reporte.value = r.fecha_reporte.replace(" ", "T").slice(0, 16);
    observaciones.value = r.observaciones;
    recomendaciones.value = r.recomendaciones;

    editMode = true;
    editId = id;
    btnText.textContent = "Actualizar Reporte";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ===============================
// UTILIDAD: nombre de archivo seguro
// ===============================
function nombreArchivoReporte(r) {
    const cliente = `${r.pr_name || ""} ${r.pr_lastname || ""}`.trim();
    const vehiculo = `${r.Marca || ""} ${r.Modelo || ""}`.trim();
    const base = `Reporte ${cliente} ${vehiculo}`.replace(/\s+/g, " ").trim();
    // Elimina caracteres no permitidos en nombres de archivo
    return base.replace(/[\\/:*?"<>|]/g, "") + ".pdf";
}

// ===============================
// PDF INDIVIDUAL
// ===============================
async function imprimirReporte(id) {
    const r = await (await fetch(`${API}/${id}`)).json();

    const fecha = r.fecha_reporte ? new Date(r.fecha_reporte) : new Date();
    const fechaStr = fecha.toLocaleDateString("es-NI", {
        day: "2-digit", month: "long", year: "numeric"
    });

    const div = document.createElement("div");
    div.style.cssText = "width:760px;padding:40px;font-family:'Segoe UI',Arial,sans-serif;color:#2b2b2b;";
    div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #b71c1c;padding-bottom:16px;margin-bottom:28px;">
            <div>
                <h1 style="margin:0;font-size:24px;color:#b71c1c;letter-spacing:0.5px;">TALLER ROSTRÁN</h1>
                <p style="margin:4px 0 0;font-size:13px;color:#666;">Reporte de Servicio Vehicular</p>
            </div>
            <div style="text-align:right;font-size:12px;color:#666;">
                <p style="margin:0;"><strong>Reporte #${r.id_reporte}</strong></p>
                <p style="margin:2px 0 0;">${fechaStr}</p>
            </div>
        </div>

        <div style="display:flex;gap:20px;margin-bottom:24px;">
            <div style="flex:1;background:#f8f8f8;border-radius:8px;padding:16px 20px;">
                <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#b71c1c;font-weight:600;">Cliente</p>
                <p style="margin:0;font-size:16px;font-weight:600;">${r.pr_name || ""} ${r.pr_lastname || ""}</p>
            </div>
            <div style="flex:1;background:#f8f8f8;border-radius:8px;padding:16px 20px;">
                <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#b71c1c;font-weight:600;">Vehículo</p>
                <p style="margin:0;font-size:16px;font-weight:600;">${r.Marca || ""} ${r.Modelo || ""}</p>
            </div>
        </div>

        <div style="background:#f8f8f8;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#b71c1c;font-weight:600;">Trabajo Realizado</p>
            <p style="margin:0;font-size:16px;font-weight:600;">${r.Name_trabajo || ""}</p>
        </div>

        <div style="margin-bottom:20px;">
            <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#b71c1c;font-weight:600;">Observaciones</p>
            <p style="margin:0;font-size:14px;line-height:1.6;border-left:3px solid #e0e0e0;padding-left:14px;white-space:pre-wrap;">${r.observaciones || "Sin observaciones."}</p>
        </div>

        <div style="margin-bottom:32px;">
            <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#b71c1c;font-weight:600;">Recomendaciones</p>
            <p style="margin:0;font-size:14px;line-height:1.6;border-left:3px solid #e0e0e0;padding-left:14px;white-space:pre-wrap;">${r.recomendaciones || "Sin recomendaciones."}</p>
        </div>

        <div style="display:flex;justify-content:space-between;margin-top:60px;">
            <div style="text-align:center;width:220px;">
                <div style="border-top:1px solid #999;padding-top:6px;font-size:12px;color:#666;">Firma del Técnico</div>
            </div>
            <div style="text-align:center;width:220px;">
                <div style="border-top:1px solid #999;padding-top:6px;font-size:12px;color:#666;">Firma del Cliente</div>
            </div>
        </div>

        <p style="margin-top:40px;font-size:10px;color:#aaa;text-align:center;">Documento generado por Taller Rostrán · ${new Date().toLocaleString("es-NI")}</p>
    `;

    const opciones = {
        margin: 10,
        filename: nombreArchivoReporte(r),
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    };

    html2pdf().set(opciones).from(div).save();
}

// ===============================
// PDF LISTA
// ===============================
async function imprimirListaCompleta() {
    const data = await (await fetch(API)).json();

    const filas = data.map(r => {
        const fecha = r.fecha_reporte ? new Date(r.fecha_reporte).toLocaleDateString("es-NI") : "";
        return `
            <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #eee;">${r.id_reporte}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #eee;">${r.pr_name || ""} ${r.pr_lastname || ""}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #eee;">${r.Marca || ""} ${r.Modelo || ""}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #eee;">${r.Name_trabajo || ""}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #eee;">${fecha}</td>
            </tr>
        `;
    }).join("");

    const div = document.createElement("div");
    div.style.cssText = "width:760px;padding:40px;font-family:'Segoe UI',Arial,sans-serif;color:#2b2b2b;";
    div.innerHTML = `
        <div style="border-bottom:4px solid #b71c1c;padding-bottom:16px;margin-bottom:24px;">
            <h1 style="margin:0;font-size:22px;color:#b71c1c;">TALLER ROSTRÁN</h1>
            <p style="margin:4px 0 0;font-size:13px;color:#666;">Listado de Reportes de Vehículos</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
                <tr style="background:#b71c1c;color:#fff;">
                    <th style="padding:10px 12px;text-align:left;">ID</th>
                    <th style="padding:10px 12px;text-align:left;">Cliente</th>
                    <th style="padding:10px 12px;text-align:left;">Vehículo</th>
                    <th style="padding:10px 12px;text-align:left;">Trabajo</th>
                    <th style="padding:10px 12px;text-align:left;">Fecha</th>
                </tr>
            </thead>
            <tbody>${filas}</tbody>
        </table>
        <p style="margin-top:24px;font-size:10px;color:#aaa;text-align:center;">Generado por Taller Rostrán · ${new Date().toLocaleString("es-NI")}</p>
    `;

    const opciones = {
        margin: 10,
        filename: `Listado de Reportes ${new Date().toLocaleDateString("es-NI").replace(/\//g, "-")}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    };

    html2pdf().set(opciones).from(div).save();
}

// ===============================
// RESET
// ===============================
function resetForm() {
    form.reset();
    editMode = false;
    editId = null;
    btnText.textContent = "Guardar Reporte";
}