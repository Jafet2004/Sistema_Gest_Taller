document.addEventListener("DOMContentLoaded", cargarNotificaciones);

const API = "http://localhost:3000"; // Ajusta según tu backend

async function cargarNotificaciones() {
    const contenedor = document.getElementById("tablaCitas");

    try {
        const res = await fetch(`${API}/notificaciones/citas-proximas`);
        const citas = await res.json();

        if (!Array.isArray(citas) || citas.length === 0) {
            contenedor.innerHTML = `
                <h3>Notificaciones recientes</h3>
                <p>No hay citas próximas en los próximos 7 días.</p>`;
            return;
        }

        // Crear lista HTML
        let html = `<h3>Próximas citas (7 días)</h3><ul class="not-list">`;

        citas.forEach(cita => {
            const fecha = new Date(cita.fecha_hora);
            const fechaFormateada = fecha.toLocaleDateString("es-ES", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });

            const clienteNombre = `${cita.pr_name} ${cita.sc_name} ${cita.pr_lastname} ${cita.sc_lastname}`;
            const trabajoNombre = cita.Name_trabajo || "Trabajo";

            html += `
                <li class="not-item">
                    <i class="fas fa-calendar-check not-icon"></i>
                    <strong>${clienteNombre}</strong> — ${trabajoNombre} <br>
                    <span class="not-date">${fechaFormateada}</span>
                </li>
            `;
        });

        html += `</ul>`;
        contenedor.innerHTML = html;

    } catch (error) {
        console.error("Error cargando notificaciones:", error);
        contenedor.innerHTML = `
            <h3>Notificaciones recientes</h3>
            <p>Error cargando datos.</p>`;
    }
}
