const API = "http://localhost:3000/trabajadores";
let editarID = null;

// =====================
// Cargar trabajadores
// =====================
async function cargarTrabajadores() {
    const res = await fetch(API);
    const data = await res.json();

    const tbody = document.getElementById("tabla-trabajadores");
    tbody.innerHTML = "";

    data.forEach(t => {
        tbody.innerHTML += `
            <tr>
                <td>${t.id_trab}</td>
                <td>${t.pr_name} ${t.sc_name}</td>
                <td>${t.pr_lastname} ${t.sc_lastname}</td>
                <td>${t.celular}</td>
                <td>
                    <button class="btn-editar" onclick='cargarEdicion(${JSON.stringify(t)})'>Editar</button>
                    <button class="btn-eliminar" onclick="eliminarTrabajador(${t.id_trab})">Eliminar</button>
                </td>
            </tr>
        `;
    });
}
cargarTrabajadores();

// =====================
// Registrar
// =====================
async function registrarTrabajador() {
    const pr_name = document.getElementById("pr_name").value;
    const sc_name = document.getElementById("sc_name").value;
    const pr_lastname = document.getElementById("pr_lastname").value;
    const sc_lastname = document.getElementById("sc_lastname").value;
    const celular = document.getElementById("celular").value;

    const data = { pr_name, sc_name, pr_lastname, sc_lastname, celular };

    const url = editarID ? `${API}/${editarID}` : API;
    const method = editarID ? "PUT" : "POST";

    await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    editarID = null;
    limpiarFormulario();
    cargarTrabajadores();
}

// =====================
// Cargar datos para editar
// =====================
function cargarEdicion(t) {
    editarID = t.id_trab;

    document.getElementById("pr_name").value = t.pr_name;
    document.getElementById("sc_name").value = t.sc_name;
    document.getElementById("pr_lastname").value = t.pr_lastname;
    document.getElementById("sc_lastname").value = t.sc_lastname;
    document.getElementById("celular").value = t.celular;

    document.querySelector(".btn-registrar").innerText = "Actualizar";
}

// =====================
// Eliminar trabajador
// =====================
async function eliminarTrabajador(id) {
    if (!confirm("¿Seguro que deseas eliminar?")) return;

    await fetch(`${API}/${id}`, { method: "DELETE" });

    cargarTrabajadores();
}

// =====================
// Limpiar form
// =====================
function limpiarFormulario() {
    document.querySelector(".btn-registrar").innerText = "Registrar";
    document.querySelectorAll("input").forEach(i => i.value = "");
}

// =====================
// Buscador
// =====================
function filtrarTabla() {
    const texto = document.getElementById("buscar").value.toLowerCase();
    const filas = document.querySelectorAll("#tabla-trabajadores tr");

    filas.forEach(fila => {
        fila.style.display = fila.innerText.toLowerCase().includes(texto)
            ? ""
            : "none";
    });
}
