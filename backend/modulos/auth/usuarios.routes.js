// =========================================================
// Administración → Usuarios y roles   (solo el GERENTE: permiso usuarios.admin)
// El SOPORTE externo solo puede restablecer contraseñas (usuarios.reset).
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db").promise();
const { cifrar, validarClaveNueva, puede } = require("./seguridad");

const h = fn => (req, res, next) => fn(req, res, next).catch(next);
const err = (status, message) => Object.assign(new Error(message), { status });

// Siempre debe quedar al menos un usuario ACTIVO con usuarios.admin
async function quedaAdministrador(conn, excluirId, nuevoRol = null, nuevoActivo = null) {
    const [[{ n }]] = await conn.query(`
        SELECT COUNT(*) AS n FROM usuario u
        WHERE u.activo = 1 AND u.id_user <> ?
          AND EXISTS (SELECT 1 FROM Rol_Permiso rp WHERE rp.id_rol = u.id_rol AND rp.codigo = 'usuarios.admin')`,
        [excluirId]);
    if (n > 0) return true;
    // ¿el propio usuario seguirá siendo administrador después del cambio?
    if (nuevoActivo === 0) return false;
    const [[{ m }]] = await conn.query(
        "SELECT COUNT(*) AS m FROM Rol_Permiso WHERE id_rol = ? AND codigo = 'usuarios.admin'", [nuevoRol]);
    return m > 0;
}

// ---------- USUARIOS ----------
router.get("/usuarios", h(async (req, res) => {
    const [rows] = await db.query(`
        SELECT u.id_user, u.name_user, u.id_rol, u.id_trab, u.activo, u.debe_cambiar_clave,
               DATE_FORMAT(u.ultimo_acceso, '%Y-%m-%d %H:%i') AS ultimo_acceso,
               r.codigo AS rol, r.nombre AS rol_nombre,
               CONCAT(t.pr_name, ' ', t.pr_lastname) AS trabajador, t.puesto
        FROM usuario u
        JOIN Rol r ON r.id_rol = u.id_rol
        LEFT JOIN Trabajador t ON t.id_trab = u.id_trab
        ORDER BY u.activo DESC, r.id_rol, u.name_user`);
    res.json(rows);
}));

// Crear  { name_user, clave, id_rol, id_trab }
router.post("/usuarios", h(async (req, res) => {
    const { name_user, clave, id_rol, id_trab } = req.body;
    if (!name_user || !/^[a-zA-Z0-9._-]{3,30}$/.test(name_user))
        throw err(400, "Usuario de 3 a 30 caracteres: letras, números, punto, guion");
    if (!id_rol) throw err(400, "Seleccione el rol");
    await validarClaveNueva(clave);
    try {
        const [r] = await db.query(
            `INSERT INTO usuario (name_user, passw, id_rol, id_trab, debe_cambiar_clave) VALUES (?, ?, ?, ?, 1)`,
            [name_user.trim(), cifrar(clave), id_rol, id_trab || null]);
        res.json({ message: "Usuario creado. Deberá cambiar la contraseña al entrar.", id_user: r.insertId });
    } catch (e) {
        if (e.code === "ER_DUP_ENTRY") throw err(409, "Ese nombre de usuario ya existe");
        throw e;
    }
}));

// Editar rol, trabajador vinculado y estado  { id_rol, id_trab, activo }
router.put("/usuarios/:id", h(async (req, res) => {
    const id = Number(req.params.id);
    const { id_rol, id_trab } = req.body;
    const activo = req.body.activo ? 1 : 0;
    if (!id_rol) throw err(400, "Seleccione el rol");
    if (!(await quedaAdministrador(db, id, id_rol, activo)))
        throw err(400, "Debe quedar al menos un usuario activo con acceso a Usuarios y roles");
    const [r] = await db.query("UPDATE usuario SET id_rol = ?, id_trab = ?, activo = ? WHERE id_user = ?",
        [id_rol, id_trab || null, activo, id]);
    if (!r.affectedRows) throw err(404, "Usuario no encontrado");
    res.json({ message: "Usuario actualizado" });
}));

// Restablecer contraseña  { clave }  (Gerente o Soporte; el Soporte no puede tocar cuentas de Gerente)
router.put("/usuarios/:id/clave", h(async (req, res) => {
    await validarClaveNueva(req.body.clave);
    const [[u]] = await db.query(`
        SELECT u.id_user, EXISTS(SELECT 1 FROM Rol_Permiso rp WHERE rp.id_rol = u.id_rol AND rp.codigo='usuarios.admin') AS es_admin
        FROM usuario u WHERE u.id_user = ?`, [req.params.id]);
    if (!u) throw err(404, "Usuario no encontrado");
    if (u.es_admin && !puede(req.usuario, "usuarios.admin"))
        throw err(403, "Solo un Gerente puede restablecer la contraseña de otro Gerente");
    await db.query("UPDATE usuario SET passw = ?, debe_cambiar_clave = 1 WHERE id_user = ?",
        [cifrar(req.body.clave), u.id_user]);
    res.json({ message: "Contraseña restablecida. Deberá cambiarla al entrar." });
}));

// ---------- ROLES Y PERMISOS ----------
router.get("/roles", h(async (req, res) => {
    const [roles] = await db.query(`
        SELECT r.*, (SELECT COUNT(*) FROM usuario u WHERE u.id_rol = r.id_rol AND u.activo = 1) AS usuarios
        FROM Rol r ORDER BY r.id_rol`);
    const [rp] = await db.query("SELECT id_rol, codigo FROM Rol_Permiso");
    roles.forEach(r => r.permisos = rp.filter(x => x.id_rol === r.id_rol).map(x => x.codigo));
    res.json(roles);
}));

router.get("/permisos", h(async (req, res) => {
    const [rows] = await db.query("SELECT * FROM Permiso ORDER BY orden");
    res.json(rows);
}));

// Reemplaza los permisos de un rol  { permisos: [codigo, ...] }
router.put("/roles/:id/permisos", h(async (req, res) => {
    const permisos = [...new Set(req.body.permisos || [])];
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query("DELETE FROM Rol_Permiso WHERE id_rol = ?", [req.params.id]);
        if (permisos.length)
            await conn.query("INSERT INTO Rol_Permiso (id_rol, codigo) SELECT ?, codigo FROM Permiso WHERE codigo IN (?)",
                [req.params.id, permisos]);
        // No permitir que el sistema quede sin administrador
        const [[{ n }]] = await conn.query(`
            SELECT COUNT(*) AS n FROM usuario u JOIN Rol_Permiso rp ON rp.id_rol = u.id_rol
            WHERE u.activo = 1 AND rp.codigo = 'usuarios.admin'`);
        if (!n) throw err(400, "Debe quedar al menos un rol con usuarios activos que tenga 'usuarios.admin'");
        await conn.commit();
        res.json({ message: "Permisos del rol actualizados (aplican de inmediato)" });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
}));

module.exports = router;
