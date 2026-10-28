const API = "http://localhost:3000";

const form = document.getElementById("formCliente");
const btnSubmit = form.querySelector("button[type='submit']");

let editMode = false;
let editId = null;

// =========================
// CARGAR CLIENTES
// =========================
let clientes = [];
const escC = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function cargarClientes() {
    fetch(`${API}/clientes`)
        .then(res => res.json())
        .then(data => { clientes = Array.isArray(data) ? data : []; mostrarClientes(clientes); })
        .catch(err => console.error("Error cargando clientes:", err));
}

// =========================
// MOSTRAR CLIENTES
// =========================
function estadoPortal(c) {
    if (!c.portal_activo) return '<span style="color:#b71c1c;font-weight:600">Bloqueado</span>';
    if (c.tiene_cuenta) return `<span style="color:#2e7d32;font-weight:600">Cuenta activa</span>${c.portal_ultimo_acceso ? `<br><small>Último acceso: ${escC(c.portal_ultimo_acceso)}</small>` : ""}`;
    if (c.cedula) return '<span style="color:#666">Puede activarla</span>';
    return '<span style="color:#999">Falta cédula</span>';
}

function mostrarClientes(lista) {
    const tbody = document.querySelector("#tablaClientes tbody");
    tbody.innerHTML = "";

    lista.forEach(cli => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${cli.id_client}</td>
            <td>${escC(cli.pr_name)} ${escC(cli.sc_name)} ${escC(cli.pr_lastname)} ${escC(cli.sc_lastname)}</td>
            <td>${escC(cli.cedula || "—")}</td>
            <td>${escC(cli.celular)}${cli.correo ? `<br><small>${escC(cli.correo)}</small>` : ""}</td>
            <td>${estadoPortal(cli)}</td>
            <td class="CRUD">
                <button class="btn-editar" data-id="${cli.id_client}" title="Editar"><i class="fas fa-edit"></i></button>
                ${cli.tiene_cuenta ? `<button class="btn-editar" data-portal="restablecer" data-id="${cli.id_client}" title="Restablecer acceso al portal (olvidó su contraseña)"><i class="fas fa-key"></i></button>` : ""}
                ${cli.tiene_cuenta || !cli.portal_activo ? `<button class="btn-editar" data-portal="${cli.portal_activo ? "bloquear" : "desbloquear"}" data-id="${cli.id_client}" title="${cli.portal_activo ? "Bloquear" : "Desbloquear"} acceso al portal"><i class="fas fa-${cli.portal_activo ? "lock" : "lock-open"}"></i></button>` : ""}
                <button class="btn-eliminar" data-id="${cli.id_client}" title="Eliminar"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(fila);
    });
}

// Un solo manejador para los botones de la tabla
document.querySelector("#tablaClientes tbody").addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.portal) return accionPortal(btn.dataset.id, btn.dataset.portal);
    if (btn.classList.contains("btn-eliminar")) return eliminarCliente(btn.dataset.id);
    if (btn.classList.contains("btn-editar")) return editarCliente(btn.dataset.id);
});

// =========================
// REGISTRAR / ACTUALIZAR CLIENTE
// =========================
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const cliente = {
        pr_name: document.getElementById("pr_name").value,
        sc_name: document.getElementById("sc_name").value,
        pr_lastname: document.getElementById("pr_lastname").value,
        sc_lastname: document.getElementById("sc_lastname").value,
        cedula: document.getElementById("cedula").value,
        celular: document.getElementById("celular").value,
        correo: document.getElementById("correo").value
    };

    try {
        const res = await fetch(editMode ? `${API}/clientes/${editId}` : `${API}/clientes`, {
            method: editMode ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cliente)
        });
        const data = await res.json();
        if (!res.ok) return notificarSistema("Error: " + (data.message || data.error), 'error');
        notificarSistema(data.message, 'exito');
        btnSubmit.innerHTML = '<i class="fas fa-save"></i> Guardar Cliente';
        editMode = false;
        editId = null;
        form.reset();
        cargarClientes();
    } catch (error) {
        console.error("Error:", error);
        notificarSistema("Error de conexión con el servidor", 'error');
    }
});

// Formato de cédula mientras se escribe: 001-010190-0001A
document.getElementById("cedula").addEventListener("input", e => {
    const s = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 14);
    e.target.value = [s.slice(0, 3), s.slice(3, 9), s.slice(9)].filter(Boolean).join("-");
});

// =========================
// ELIMINAR CLIENTE
// =========================
async function eliminarCliente(id) {
    const confirmado = await confirmarSistema("¿Seguro que deseas eliminar este cliente?", "Eliminar cliente");
    if (!confirmado) return;

    try {
        const res = await fetch(`${API}/clientes/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (res.ok) {
            notificarSistema(data.message, 'exito');
            cargarClientes();
        } else {
            notificarSistema("Error: " + (data.message || "No se pudo eliminar"), 'error');
        }
    } catch (error) {
        console.error("Error:", error);
        notificarSistema("Error de conexión con el servidor", 'error');
    }
}

// =========================
// PORTAL DEL CLIENTE: restablecer / bloquear / desbloquear acceso
// =========================
async function accionPortal(id, accion) {
    const textos = {
        restablecer: "Se borrará la contraseña del cliente. Deberá activar su cuenta de nuevo en el sitio con su cédula y celular.",
        bloquear: "El cliente no podrá iniciar sesión en el sitio hasta que lo desbloquee.",
        desbloquear: "El cliente podrá volver a iniciar sesión en el sitio."
    };
    if (!await confirmarSistema(textos[accion], "Acceso al portal de clientes")) return;
    try {
        const res = await fetch(`${API}/clientes/${id}/portal`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion })
        });
        const data = await res.json();
        notificarSistema(data.message, res.ok ? 'exito' : 'error');
        if (res.ok) cargarClientes();
    } catch { notificarSistema("Error de conexión con el servidor", 'error'); }
}

// =========================
// EDITAR CLIENTE (con los datos ya cargados, no leyendo la tabla)
// =========================
function editarCliente(id) {
    const c = clientes.find(x => x.id_client == id);
    if (!c) return;
    document.getElementById("pr_name").value = c.pr_name;
    document.getElementById("sc_name").value = c.sc_name;
    document.getElementById("pr_lastname").value = c.pr_lastname;
    document.getElementById("sc_lastname").value = c.sc_lastname;
    document.getElementById("cedula").value = c.cedula || "";
    document.getElementById("celular").value = c.celular;
    document.getElementById("correo").value = c.correo || "";

    editMode = true;
    editId = id;
    btnSubmit.innerHTML = '<i class="fas fa-edit"></i> Actualizar Cliente';
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// =========================
// BUSCADOR
// =========================
document.getElementById("buscar").addEventListener("input", function () {
    const valor = this.value.toLowerCase();
    const filas = document.querySelectorAll("#tablaClientes tbody tr");
    filas.forEach(fila => {
        const texto = fila.innerText.toLowerCase();
        fila.style.display = texto.includes(valor) ? "" : "none";
    });
});

// =========================
// CARGAR CLIENTES AL INICIO
// =========================
cargarClientes();