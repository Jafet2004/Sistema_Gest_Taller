// ===============================
// CONFIG
// ===============================
const API = "http://localhost:3000/reportes";
const API_CLIENTES = "http://localhost:3000/clientes";
const API_VEHICULOS = "http://localhost:3000/vehiculos";
const API_TRABAJOS = "http://localhost:3000/trabajos";

// ===============================
// ELEMENTOS
// ===============================
const form = document.getElementById("reportForm");
const btnCancelar = document.getElementById("btn-cancelar");
const btnPrintAll = document.getElementById("btn-imprimir-lista");
const btnRefrescar = document.getElementById("btn-refrescar");
const btnText = document.getElementById("btn-text");

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
                    ${t.Name_trabajo} - C$ ${t.Precio}
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

        resetForm();
        cargarReportes();

    } catch (err) {
        alert("Error al guardar reporte");
    }
});

// ===============================
// ELIMINAR
// ===============================
async function eliminarReporte(id) {
    if (!confirm("¿Eliminar reporte?")) return;
    await fetch(`${API}/${id}`, { method: "DELETE" });
    cargarReportes();
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
// PDF INDIVIDUAL
// ===============================
async function imprimirReporte(id) {
    const r = await (await fetch(`${API}/${id}`)).json();

    const div = document.createElement("div");
    div.innerHTML = `
        <h2>Reporte Vehículo</h2>
        <p><strong>Cliente:</strong> ${r.pr_name} ${r.pr_lastname}</p>
        <p><strong>Vehículo:</strong> ${r.Marca} ${r.Modelo}</p>
        <p><strong>Trabajo:</strong> ${r.Name_trabajo}</p>
        <p><strong>Fecha:</strong> ${new Date(r.fecha_reporte).toLocaleString()}</p>
        <p><strong>Observaciones:</strong><br>${r.observaciones}</p>
        <p><strong>Recomendaciones:</strong><br>${r.recomendaciones}</p>
    `;

    html2pdf().from(div).save(`reporte_${id}.pdf`);
}

// ===============================
// PDF LISTA
// ===============================
async function imprimirListaCompleta() {
    const data = await (await fetch(API)).json();

    const div = document.createElement("div");
    div.innerHTML = `<h2>Listado de Reportes</h2>`;

    data.forEach(r => {
        div.innerHTML += `
            <hr>
            <p><strong>ID:</strong> ${r.id_reporte}</p>
            <p>${r.pr_name} ${r.pr_lastname} - ${r.Marca} ${r.Modelo}</p>
        `;
    });

    html2pdf().from(div).save("lista_reportes.pdf");
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
