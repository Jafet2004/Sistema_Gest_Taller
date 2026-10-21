const API = "http://localhost:3000";

const form = document.getElementById("formCliente");
const btnSubmit = form.querySelector("button[type='submit']");

let editMode = false;
let editId = null;

// =========================
// CARGAR CLIENTES
// =========================
function cargarClientes() {
    fetch(`${API}/clientes`)
        .then(res => res.json())
        .then(data => mostrarClientes(data))
        .catch(err => console.error("Error cargando clientes:", err));
}

// =========================
// MOSTRAR CLIENTES
// =========================
function mostrarClientes(clientes) {
    const tbody = document.querySelector("#tablaClientes tbody");
    tbody.innerHTML = "";

    clientes.forEach(cli => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${cli.id_client}</td>
            <td>${cli.pr_name} ${cli.sc_name} ${cli.pr_lastname} ${cli.sc_lastname}</td>
            <td>${cli.celular}</td>
            <td class="CRUD">
                <button class="btn-editar" data-id="${cli.id_client}"><i class="fas fa-edit"></i></button>
                <button class="btn-eliminar" data-id="${cli.id_client}"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(fila);
    });

    // Eventos botones
    document.querySelectorAll(".btn-eliminar").forEach(btn =>
        btn.addEventListener("click", () => eliminarCliente(btn.dataset.id))
    );

    document.querySelectorAll(".btn-editar").forEach(btn =>
        btn.addEventListener("click", () => editarCliente(btn.dataset.id))
    );
}

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
        celular: document.getElementById("celular").value
    };

    try {
        let res, data;

        if (editMode) {
            // ACTUALIZAR
            res = await fetch(`${API}/clientes/${editId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cliente)
            });
            data = await res.json();
            if (res.ok) {
                notificarSistema(data.message, 'exito');
                btnSubmit.innerHTML = '<i class="fas fa-save"></i> Guardar Cliente';
                editMode = false;
                editId = null;
                form.reset();
                cargarClientes();
            } else {
                notificarSistema("Error: " + (data.error || data.message), 'error');
            }
        } else {
            // CREAR
            res = await fetch(`${API}/clientes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cliente)
            });
            data = await res.json();
            if (res.ok) {
                notificarSistema(data.message, 'exito');
                form.reset();
                cargarClientes();
            } else {
                notificarSistema("Error: " + (data.error || data.message), 'error');
            }
        }
    } catch (error) {
        console.error("Error:", error);
        notificarSistema("Error de conexión con el servidor", 'error');
    }
});

// =========================
// ELIMINAR CLIENTE
// =========================
async function eliminarCliente(id) {
    const confirmado = await confirmarSistema("¿Seguro que deseas eliminar este cliente?", "Eliminar cliente");
    if (!confirmado) return;

    try {
        const res = await fetch(`${API}/clientes/${id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" }
        });
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
// EDITAR CLIENTE
// =========================
function editarCliente(id) {
    const fila = document.querySelector(`button[data-id='${id}']`).closest("tr");
    document.getElementById("pr_name").value = fila.children[1].innerText.split(" ")[0];
    document.getElementById("sc_name").value = fila.children[1].innerText.split(" ")[1];
    document.getElementById("pr_lastname").value = fila.children[1].innerText.split(" ")[2];
    document.getElementById("sc_lastname").value = fila.children[1].innerText.split(" ")[3];
    document.getElementById("celular").value = fila.children[2].innerText;

    editMode = true;
    editId = id;
    btnSubmit.innerHTML = '<i class="fas fa-edit"></i> Actualizar Cliente';
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