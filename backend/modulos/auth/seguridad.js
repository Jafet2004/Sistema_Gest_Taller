// =========================================================
// SEGURIDAD: contraseñas cifradas + carga del usuario y sus permisos
// Usa scrypt (incluido en Node.js): no hay que instalar nada.
// =========================================================
const crypto = require("crypto");
const db = require("../../config/db").promise();

const err = (status, message) => Object.assign(new Error(message), { status });

// ---------- contraseñas ----------
function cifrar(clave) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(String(clave), salt, 64).toString("hex");
    return `scrypt$${salt}$${hash}`;
}

/** Compara la clave con lo guardado. Acepta claves viejas en texto plano (devuelve { ok, legado }) */
function verificar(clave, guardada) {
    if (typeof guardada !== "string") return { ok: false };
    if (guardada.startsWith("scrypt$")) {
        const [, salt, hash] = guardada.split("$");
        const calc = crypto.scryptSync(String(clave), salt, 64);
        const ref = Buffer.from(hash, "hex");
        return { ok: ref.length === calc.length && crypto.timingSafeEqual(ref, calc) };
    }
    // Contraseña antigua sin cifrar: se acepta una vez y se cifra al entrar
    return { ok: String(clave) === guardada, legado: true };
}

// ---------- política de contraseñas (tabla Configuracion) ----------
const POLITICA_POR_DEFECTO = { min_longitud: 8, requiere_letra: true, requiere_numero: true,
                               requiere_mayuscula: false, requiere_simbolo: false };

/** Lee la política desde la BD. Si falta alguna fila, usa el valor por defecto. */
async function obtenerPolitica() {
    const [rows] = await db.query("SELECT clave, valor FROM Configuracion WHERE clave LIKE 'clave\\_%'");
    const v = Object.fromEntries(rows.map(r => [r.clave.replace(/^clave_/, ""), r.valor]));
    const bool = (k) => v[k] === undefined ? POLITICA_POR_DEFECTO[k] : v[k] === "1";
    const min = parseInt(v.min_longitud, 10);
    return {
        min_longitud: Number.isFinite(min) && min > 0 ? min : POLITICA_POR_DEFECTO.min_longitud,
        requiere_letra: bool("requiere_letra"),
        requiere_numero: bool("requiere_numero"),
        requiere_mayuscula: bool("requiere_mayuscula"),
        requiere_simbolo: bool("requiere_simbolo")
    };
}

/** Devuelve la lista de requisitos que la clave NO cumple (vacía = cumple) */
function incumplimientos(clave, p) {
    const c = String(clave || ""), f = [];
    if (c.length < p.min_longitud) f.push(`al menos ${p.min_longitud} caracteres`);
    if (p.requiere_letra && !/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(c)) f.push("una letra");
    if (p.requiere_numero && !/\d/.test(c)) f.push("un número");
    if (p.requiere_mayuscula && !/[A-ZÁÉÍÓÚÑ]/.test(c)) f.push("una mayúscula");
    if (p.requiere_simbolo && !/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/.test(c)) f.push("un símbolo");
    return f;
}

/** Valida una contraseña nueva contra la política de la BD (lanza 400 si no cumple) */
async function validarClaveNueva(clave) {
    const f = incumplimientos(clave, await obtenerPolitica());
    if (f.length) throw err(400, "La contraseña debe tener " + f.join(", "));
}

/** ¿La clave cumple la política vigente? (para forzar el cambio de contraseñas viejas al entrar) */
async function cumplePolitica(clave) {
    return incumplimientos(clave, await obtenerPolitica()).length === 0;
}

// ---------- usuario actual ----------
/** Lee de la BD el usuario de la sesión con su rol y permisos (así un cambio de rol o una
 *  desactivación aplica de inmediato, sin esperar a que vuelva a iniciar sesión). */
async function cargarUsuario(id_user) {
    const [[u]] = await db.query(`
        SELECT u.id_user, u.name_user, u.id_rol, u.id_trab, u.activo, u.debe_cambiar_clave,
               r.codigo AS rol, r.nombre AS rol_nombre,
               CONCAT(t.pr_name, ' ', t.pr_lastname) AS trabajador
        FROM usuario u
        JOIN Rol r ON r.id_rol = u.id_rol
        LEFT JOIN Trabajador t ON t.id_trab = u.id_trab
        WHERE u.id_user = ?`, [id_user]);
    if (!u || !u.activo) return null;
    const [perms] = await db.query("SELECT codigo FROM Rol_Permiso WHERE id_rol = ?", [u.id_rol]);
    u.permisos = perms.map(p => p.codigo);
    return u;
}

function puede(usuario, ...codigos) {
    return !!usuario && codigos.some(c => usuario.permisos.includes(c));
}

/** Para usar DENTRO de una ruta cuando la regla depende de los datos */
function exigir(req, ...codigos) {
    if (!puede(req.usuario, ...codigos)) throw err(403, "No tiene permiso para esta acción");
}

module.exports = { cifrar, verificar, validarClaveNueva, cumplePolitica, obtenerPolitica, cargarUsuario, puede, exigir };
