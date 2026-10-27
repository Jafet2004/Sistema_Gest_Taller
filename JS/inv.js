const API = "http://localhost:3000";

const form = document.getElementById("formHerramienta");
const btnSubmit = form.querySelector("button[type='submit']");

let editMode = false;
let editId = null;

// =========================
// CARGAR INVENTARIO
// =========================
function cargarInventario() {
    fetch(`${API}/inventario`)
        .then(res => res.json())
        .then(data => mostrarInventario(data))
        .catch(err => console.error("Error cargando inventario:", err));
}

// =========================
// MOSTRAR INVENTARIO
// =========================
function mostrarInventario(inventario) {
    const tbody = document.querySelector("#tablaHerramientas tbody");
    tbody.innerHTML = "";

    inventario.forEach(inv => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${inv.id_invt}</td>
            <td>${inv.name_tool}</td>
            <td>${inv.marca}</td>
            <td>${inv.cantidad}</td>
            <td class="CRUD">
                <button class="btn-editar" data-id="${inv.id_invt}"><i class="fas fa-edit"></i></button>
                <button class="btn-eliminar" data-id="${inv.id_invt}"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(fila);
    });

    // Eventos botones
    document.querySelectorAll(".btn-eliminar").forEach(btn =>
        btn.addEventListener("click", () => eliminarHerramienta(btn.dataset.id))
    );

    document.querySelectorAll(".btn-editar").forEach(btn =>
        btn.addEventListener("click", () => editarHerramienta(btn.dataset.id))
    );
}

// =========================
// REGISTRAR / ACTUALIZAR
// =========================
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const herramienta = {
        name_tool: document.getElementById("tool_name").value,
        marca: document.getElementById("tool_marca").value,
        cantidad: parseInt(document.getElementById("tool_cantidad").value)
    };

    try {
        let res, data;

        if (editMode) {
            // ACTUALIZAR
            res = await fetch(`${API}/inventario/${editId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(herramienta)
            });
            data = await res.json();
            if (res.ok) {
                notificarSistema(data.message, 'exito');
                btnSubmit.innerHTML = '<i class="fas fa-save"></i> Guardar Herramienta';
                editMode = false;
                editId = null;
                form.reset();
                cargarInventario();
            } else {
                notificarSistema("Error: " + (data.error || data.message), 'error');
            }
        } else {
            // CREAR
            res = await fetch(`${API}/inventario`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(herramienta)
            });
            data = await res.json();
            if (res.ok) {
                notificarSistema(data.message, 'exito');
                form.reset();
                cargarInventario();
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
// ELIMINAR
// =========================
async function eliminarHerramienta(id) {
    const confirmado = await confirmarSistema("¿Seguro que deseas eliminar esta herramienta?", "Eliminar herramienta");
    if (!confirmado) return;

    try {
        const res = await fetch(`${API}/inventario/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (res.ok) {
            notificarSistema(data.message, 'exito');
            cargarInventario();
        } else {
            notificarSistema("Error: " + (data.message || "No se pudo eliminar"), 'error');
        }
    } catch (error) {
        console.error("Error:", error);
        notificarSistema("Error de conexión con el servidor", 'error');
    }
}

// =========================
// EDITAR
// =========================
function editarHerramienta(id) {
    const fila = document.querySelector(`button[data-id='${id}']`).closest("tr");
    document.getElementById("tool_name").value = fila.children[1].innerText;
    document.getElementById("tool_marca").value = fila.children[2].innerText;
    document.getElementById("tool_cantidad").value = fila.children[3].innerText;

    editMode = true;
    editId = id;
    btnSubmit.innerHTML = '<i class="fas fa-edit"></i> Actualizar Herramienta';
}

// =========================
// BUSCADOR
// =========================
document.getElementById("buscar").addEventListener("input", function () {
    const valor = this.value.toLowerCase();
    const filas = document.querySelectorAll("#tablaHerramientas tbody tr");
    filas.forEach(fila => {
        const texto = fila.innerText.toLowerCase();
        fila.style.display = texto.includes(valor) ? "" : "none";
    });
});

// =========================
// CARGAR INVENTARIO AL INICIO
// =========================
cargarInventario();