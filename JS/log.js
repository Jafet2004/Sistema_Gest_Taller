// JavaScript/log.js
// Lógica del formulario de inicio de sesión

// ============================================================
// CONFIGURACIÓN
// ============================================================
const API_URL = "http://localhost:3000/login"; // Ajusta si tu backend corre en otra URL
const MAX_INTENTOS = 3;
const TIEMPO_BLOQUEO_MS = 1 * 60 * 1000; // 1 minuto

const LS_INTENTOS = "login_intentos_fallidos";
const LS_BLOQUEO_HASTA = "login_bloqueo_hasta";

// ============================================================
// ELEMENTOS DEL DOM
// ============================================================
const form = document.getElementById("loginForm");
const inputName = document.getElementById("name");
const inputPassword = document.getElementById("password");
const passwordCheckIcon = document.getElementById("passwordCheckIcon");
const alertBox = document.getElementById("alertBox");
const loginBtn = document.getElementById("loginBtn");

let intervaloCuentaRegresiva = null;

// ============================================================
// UTILIDADES DE ALERTA
// ============================================================
function mostrarAlerta(mensaje) {
    alertBox.textContent = mensaje;
    alertBox.classList.remove("d-none");
}

function ocultarAlerta() {
    alertBox.classList.add("d-none");
    alertBox.textContent = "";
}

// ============================================================
// REQUISITOS DE CONTRASEÑA
// La regla NO está escrita aquí: se lee de la BD (tabla Configuracion) por medio de
// GET /politica-clave. El check verde es solo una guía; quien valida es el servidor.
// ============================================================
let politica = null;

function textoPolitica(p) {
    const r = [`mínimo ${p.min_longitud} caracteres`];
    if (p.requiere_letra) r.push("al menos una letra");
    if (p.requiere_numero) r.push("un número");
    if (p.requiere_mayuscula) r.push("una mayúscula");
    if (p.requiere_simbolo) r.push("un símbolo");
    return "La contraseña debe tener " + r.join(", ") + ".";
}

async function cargarPolitica() {
    const ayuda = document.getElementById("passwordHelp");
    try {
        const res = await fetch(API_URL.replace(/\/login$/, "/politica-clave"));
        politica = await res.json();
        if (ayuda) ayuda.textContent = textoPolitica(politica);
    } catch {
        if (ayuda) ayuda.textContent = "";
    }
}
cargarPolitica();

function esPasswordValido(valor) {
    if (!politica) return false;
    if (valor.length < politica.min_longitud) return false;
    if (politica.requiere_letra && !/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(valor)) return false;
    if (politica.requiere_numero && !/\d/.test(valor)) return false;
    if (politica.requiere_mayuscula && !/[A-ZÁÉÍÓÚÑ]/.test(valor)) return false;
    if (politica.requiere_simbolo && !/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/.test(valor)) return false;
    return true;
}

inputPassword.addEventListener("input", () => {
    if (esPasswordValido(inputPassword.value)) {
        passwordCheckIcon.style.display = "flex";
        inputPassword.classList.remove("is-invalid");
        inputPassword.classList.add("is-valid");
    } else {
        passwordCheckIcon.style.display = "none";
        inputPassword.classList.remove("is-valid");
    }
});

// ============================================================
// MANEJO DE BLOQUEO POR INTENTOS FALLIDOS (persistente en localStorage)
// ============================================================
function obtenerIntentos() {
    return parseInt(localStorage.getItem(LS_INTENTOS) || "0", 10);
}

function guardarIntentos(cantidad) {
    localStorage.setItem(LS_INTENTOS, String(cantidad));
}

function obtenerBloqueoHasta() {
    return parseInt(localStorage.getItem(LS_BLOQUEO_HASTA) || "0", 10);
}

function activarBloqueo() {
    const hasta = Date.now() + TIEMPO_BLOQUEO_MS;
    localStorage.setItem(LS_BLOQUEO_HASTA, String(hasta));
    guardarIntentos(0); // reinicia el contador; el bloqueo se rige por el tiempo
    iniciarCuentaRegresiva(hasta);
}

function limpiarBloqueo() {
    localStorage.removeItem(LS_BLOQUEO_HASTA);
    guardarIntentos(0);
}

function formatearTiempo(ms) {
    const totalSegundos = Math.ceil(ms / 1000);
    const minutos = Math.floor(totalSegundos / 60);
    const segundos = totalSegundos % 60;
    return `${minutos}:${segundos.toString().padStart(2, "0")}`;
}

function bloquearFormulario() {
    loginBtn.disabled = true;
    inputName.disabled = true;
    inputPassword.disabled = true;
}

function desbloquearFormulario() {
    loginBtn.disabled = false;
    inputName.disabled = false;
    inputPassword.disabled = false;
}

function iniciarCuentaRegresiva(hasta) {
    bloquearFormulario();

    if (intervaloCuentaRegresiva) clearInterval(intervaloCuentaRegresiva);

    const actualizar = () => {
        const restante = hasta - Date.now();
        if (restante <= 0) {
            clearInterval(intervaloCuentaRegresiva);
            limpiarBloqueo();
            desbloquearFormulario();
            ocultarAlerta();
            return;
        }
        mostrarAlerta(
            `Demasiados errores al iniciar sesión, intenta nuevamente en 1 min (${formatearTiempo(restante)})`
        );
    };

    actualizar();
    intervaloCuentaRegresiva = setInterval(actualizar, 1000);
}

function verificarEstadoBloqueoAlCargar() {
    const hasta = obtenerBloqueoHasta();
    if (hasta && hasta > Date.now()) {
        iniciarCuentaRegresiva(hasta);
    } else if (hasta) {
        // El bloqueo ya expiró
        limpiarBloqueo();
    }
}

verificarEstadoBloqueoAlCargar();

// ============================================================
// ENVÍO DEL FORMULARIO
// ============================================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    ocultarAlerta();

    // Si está bloqueado, no permitir intentar
    const hasta = obtenerBloqueoHasta();
    if (hasta && hasta > Date.now()) {
        iniciarCuentaRegresiva(hasta);
        return;
    }

    const name_user = inputName.value.trim();
    const passw = inputPassword.value;

    if (!name_user) {
        mostrarAlerta("Ingresa tu nombre de usuario.");
        return;
    }

    if (!passw) {
        mostrarAlerta("Ingresa tu contraseña.");
        return;
    }

    // Nota: el check verde es solo una guía visual. El servidor valida las credenciales y,
    // si la contraseña ya no cumple la política de la BD, obliga a cambiarla al entrar.

    loginBtn.disabled = true;
    loginBtn.textContent = "Ingresando...";

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name_user, passw })
        });

        const data = await response.json().catch(() => ({}));

        console.log("Respuesta del servidor:", response.status, data);

        if (response.ok) {
            console.log("Login correcto, redirigiendo...");
            limpiarBloqueo();
            window.location.href = "./index.html";
            return;
        }

        // Login incorrecto -> contar el intento fallido
        const intentos = obtenerIntentos() + 1;
        guardarIntentos(intentos);

        if (intentos >= MAX_INTENTOS) {
            activarBloqueo();
        } else {
            const restantes = MAX_INTENTOS - intentos;
            mostrarAlerta(
                (data.message || "Usuario o contraseña incorrectos") +
                    `. Te quedan ${restantes} intento(s).`
            );
        }
    } catch (error) {
        console.error("Error al conectar con el servidor:", error);
        mostrarAlerta("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
        // Reactivar el botón solo si el formulario no quedó bloqueado
        const bloqueadoActual = obtenerBloqueoHasta();
        if (!(bloqueadoActual > Date.now())) {
            loginBtn.disabled = false;
        }
        loginBtn.textContent = "Iniciar sesión";
    }
});