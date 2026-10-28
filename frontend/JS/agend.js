const API = "http://localhost:3000";

const form = document.getElementById("formCita");
const btnSubmit = form.querySelector("button[type='submit']");
let editMode = false;
let editId = null;

// =========================
// CARGAR SELECTS
// =========================
async function cargarSelects() {
    try {
        const resClientes = await fetch(`${API}/clientes`);
        const clientes = await resClientes.json();

        const clienteSelect = document.getElementById("cliente");
        clienteSelect.innerHTML = "<option value=''>Seleccione Cliente</option>";

        clientes.forEach(c => {
            clienteSelect.innerHTML += `
                <option value="${c.id_client}">
                    ${c.pr_name} ${c.pr_lastname}
                </option>`;
        });

        const resTrab = await fetch(`${API}/trabajos`);
        const trabajos = await resTrab.json();

        const trabajoSelect = document.getElementById("trabajo");
        trabajoSelect.innerHTML = "<option value=''>Seleccione Trabajo</option>";

        trabajos.forEach(t => {
            trabajoSelect.innerHTML += `
                <option value="${t.id_trabajo}">
                    ${t.Name_trabajo}
                </option>`;
        });

    } catch (error) {
        notificarSistema("Error cargando información de selects", 'error');
        console.error(error);
    }
}

// =========================
// CARGAR CITAS
// =========================
async function cargarCitas() {
    try {
        const res = await fetch(`${API}/agenda`);
        const citas = await res.json();
        mostrarCitas(citas);
    } catch (error) {
        console.error(error);
        notificarSistema("Error cargando citas", 'error');
    }
}

// =========================
// MOSTRAR CITAS
// =========================
function mostrarCitas(citas) {
    const tbody = document.querySelector("#tablaCitas tbody");
    tbody.innerHTML = "";

    citas.forEach(cita => {
        const fecha = new Date(cita.fecha_hora).toLocaleString();

        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${cita.id_cita}</td>
            <td>${cita.cliente}</td>
            <td>${cita.trabajo}</td>
            <td>${fecha}</td>
            <td>${cita.descripcion}</td>
            <td class="CRUD">
                <button class="btn-editar" data-id="${cita.id_cita}">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="btn-eliminar" data-id="${cita.id_cita}">
                    <i class="fas fa-trash-alt"></i> Eliminar
                </button>
            </td>
        `;
        tbody.appendChild(fila);
    });

    document.querySelectorAll(".btn-eliminar").forEach(btn =>
        btn.addEventListener("click", () => eliminarCita(btn.dataset.id))
    );

    document.querySelectorAll(".btn-editar").forEach(btn =>
        btn.addEventListener("click", () => editarCita(btn.dataset.id))
    );
}

// =========================
// CREAR / EDITAR CITA
// =========================
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const cita = {
        id_client: document.getElementById("cliente").value,
        id_trabajo: document.getElementById("trabajo").value,
        descripcion: document.getElementById("descripcion").value,
        fecha_hora: document.getElementById("fecha_hora").value
    };

    try {
        let res;

        if (editMode) {
            res = await fetch(`${API}/agenda/${editId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cita)
            });

        } else {
            res = await fetch(`${API}/agenda`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cita)
            });
        }

        const data = await res.json();
        notificarSistema(data.message, 'exito');

        form.reset();
        editMode = false;
        editId = null;
        btnSubmit.innerHTML = `<i class="fas fa-save"></i> Guardar Cita`;

        cargarCitas();

    } catch (error) {
        notificarSistema("Error al guardar", 'error');
        console.error(error);
    }
});

// =========================
// ELIMINAR CITA
// =========================
async function eliminarCita(id) {
    const confirmado = await confirmarSistema("¿Eliminar esta cita?", "Eliminar cita");
    if (!confirmado) return;

    try {
        const res = await fetch(`${API}/agenda/${id}`, { method: "DELETE" });
        const data = await res.json();
        notificarSistema(data.message, 'exito');
        cargarCitas();
    } catch (error) {
        notificarSistema("Error eliminando", 'error');
        console.error(error);
    }
}

// =========================
// EDITAR CITA
// =========================
async function editarCita(id) {
    try {
        const res = await fetch(`${API}/agenda/${id}`);
        const cita = await res.json();

        document.getElementById("cliente").value = cita.id_client;
        document.getElementById("trabajo").value = cita.id_trabajo;
        document.getElementById("descripcion").value = cita.descripcion;

        // Formato correcto para datetime-local
        document.getElementById("fecha_hora").value =
            cita.fecha_hora.replace(" ", "T").slice(0, 16);

        editMode = true;
        editId = id;
        btnSubmit.innerHTML = `<i class="fas fa-edit"></i> Actualizar Cita`;

    } catch (error) {
        notificarSistema("Error cargando cita", 'error');
        console.error(error);
    }
}

// =========================
// BUSCADOR
// =========================
document.getElementById("buscar").addEventListener("input", function () {
    const val = this.value.toLowerCase();
    document.querySelectorAll("#tablaCitas tbody tr").forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(val) ? "" : "none";
    });
});

// =========================
// INICIAL
// =========================
cargarSelects();
cargarCitas();