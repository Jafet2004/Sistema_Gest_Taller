// =========================================================
// NOTIFICACIONES DEL SISTEMA — Taller Rostrán
// Reemplaza alert() y confirm() nativos del navegador
// Incluir después de <link Estilos/notificaciones.css> y
// antes de los demás scripts de cada página.
// =========================================================

const CONFIG_TOAST = {
    exito:       { icono: "fa-circle-check",     titulo: "Éxito" },
    error:       { icono: "fa-circle-xmark",      titulo: "Error" },
    advertencia: { icono: "fa-triangle-exclamation", titulo: "Atención" },
    info:        { icono: "fa-circle-info",       titulo: "Aviso" }
};

function _obtenerContenedorToasts() {
    let contenedor = document.getElementById("toast-sistema-container");
    if (!contenedor) {
        contenedor = document.createElement("div");
        contenedor.id = "toast-sistema-container";
        document.body.appendChild(contenedor);
    }
    return contenedor;
}

/**
 * Muestra una notificación tipo "toast" en la esquina superior derecha.
 * @param {string} mensaje - Texto a mostrar.
 * @param {'exito'|'error'|'advertencia'|'info'} tipo - Estilo de la notificación.
 * @param {number} duracion - Milisegundos antes de desaparecer (0 = no desaparece sola).
 */
function notificarSistema(mensaje, tipo = "info", duracion = 4000) {
    const config = CONFIG_TOAST[tipo] || CONFIG_TOAST.info;
    const contenedor = _obtenerContenedorToasts();

    const toast = document.createElement("div");
    toast.className = `toast-sistema ${tipo}`;
    toast.innerHTML = `
        <i class="fas ${config.icono} toast-sistema-icono"></i>
        <div class="toast-sistema-contenido">
            <p class="toast-sistema-titulo">${config.titulo}</p>
            <p class="toast-sistema-mensaje">${mensaje}</p>
        </div>
        <button type="button" class="toast-sistema-cerrar" aria-label="Cerrar">&times;</button>
    `;

    const cerrarToast = () => {
        toast.classList.add("saliendo");
        setTimeout(() => toast.remove(), 200);
    };

    toast.querySelector(".toast-sistema-cerrar").addEventListener("click", cerrarToast);
    contenedor.appendChild(toast);

    if (duracion > 0) {
        setTimeout(cerrarToast, duracion);
    }

    return toast;
}

/**
 * Muestra un modal de confirmación con botones Cancelar/Aceptar.
 * Reemplaza a confirm(). Devuelve una Promise<boolean>.
 * @param {string} mensaje
 * @param {string} titulo
 */
function confirmarSistema(mensaje, titulo = "Confirmar acción") {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "modal-confirm-overlay";
        overlay.innerHTML = `
            <div class="modal-confirm-caja">
                <div class="modal-confirm-header">
                    <i class="fas fa-triangle-exclamation"></i> ${titulo}
                </div>
                <div class="modal-confirm-body">${mensaje}</div>
                <div class="modal-confirm-footer">
                    <button type="button" class="modal-confirm-btn-cancelar">Cancelar</button>
                    <button type="button" class="modal-confirm-btn-aceptar">Aceptar</button>
                </div>
            </div>
        `;

        const cerrar = (resultado) => {
            overlay.remove();
            resolve(resultado);
        };

        overlay.querySelector(".modal-confirm-btn-cancelar").addEventListener("click", () => cerrar(false));
        overlay.querySelector(".modal-confirm-btn-aceptar").addEventListener("click", () => cerrar(true));
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) cerrar(false);
        });

        document.body.appendChild(overlay);
    });
}
