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
                        <button class="btn-editar" onclick='editar(${JSON.stringify(s)})'><i class="fas fa-edit"></i></button>
                        <button class="btn-eliminar" onclick='eliminar(${s.id_trabajo})'><i class="fas fa-trash-alt"></i></button>
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
        .then(r => r.json())
        .then(r => {
            alert(r.message);
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
}

// ================== ELIMINAR ==================
function eliminar(id) {
    if (!confirm("¿Eliminar servicio?")) return;

    fetch(`${API}/trabajos/${id}`, { method: "DELETE" })
        .then(r => r.json())
        .then(r => {
            alert(r.message);
            cargarServicios();
        });
}

// ================== INICIALIZAR ==================
cargarServicios();
