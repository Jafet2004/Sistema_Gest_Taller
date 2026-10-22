// =========================================================
// Autenticación (login / sesión / logout / cambio de contraseña)
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db").promise();
const { cifrar, verificar, validarClaveNueva, cumplePolitica, obtenerPolitica, cargarUsuario } = require("./seguridad");

const h = fn => (req, res, next) => fn(req, res, next).catch(next);

const publico = u => ({
    id: u.id_user, nombre: u.name_user, rol: u.rol, rol_nombre: u.rol_nombre,
    id_trab: u.id_trab, trabajador: u.trabajador,
    debe_cambiar_clave: !!u.debe_cambiar_clave, permisos: u.permisos
});

// LOGIN
router.post("/login", h(async (req, res) => {
    const { name_user, passw } = req.body;
    if (!name_user || !passw) return res.status(400).json({ message: "Faltan campos" });

    const [[u]] = await db.query("SELECT id_user, passw, activo FROM usuario WHERE name_user = ?", [name_user.trim()]);
    const v = u ? verificar(passw, u.passw) : { ok: false };
    if (!v.ok) return res.status(401).json({ message: "Credenciales inválidas" });
    if (!u.activo) return res.status(403).json({ message: "Usuario desactivado. Contacte al Gerente." });

    // Contraseña antigua en texto plano → se guarda cifrada desde ya
    if (v.legado) await db.query("UPDATE usuario SET passw = ? WHERE id_user = ?", [cifrar(passw), u.id_user]);
    // Si la contraseña ya no cumple la política de la BD (p. ej. una vieja de menos de 8 caracteres),
    // el usuario entra pero debe crear una nueva antes de usar el sistema.
    if (!(await cumplePolitica(passw)))
        await db.query("UPDATE usuario SET debe_cambiar_clave = 1 WHERE id_user = ?", [u.id_user]);
    await db.query("UPDATE usuario SET ultimo_acceso = NOW() WHERE id_user = ?", [u.id_user]);

    const usuario = await cargarUsuario(u.id_user);
    req.session.regenerate(e => {
        if (e) return res.status(500).json({ message: "Error de sesión" });
        req.session.userId = u.id_user;
        req.session.username = usuario.name_user;
        res.json({ message: "Login exitoso", user: publico(usuario) });
    });
}));

// VERIFICAR SESIÓN (devuelve rol y permisos para armar el menú)
router.get("/check-session", h(async (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    const usuario = await cargarUsuario(req.session.userId);
    if (!usuario) return res.json({ loggedIn: false });
    res.json({ loggedIn: true, user: publico(usuario) });
}));

// LOGOUT
router.post("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ message: "Error al cerrar sesión" });
        res.clearCookie("connect.sid");
        res.json({ message: "Sesión cerrada" });
    });
});

// CAMBIAR MI CONTRASEÑA  { actual, nueva }
router.post("/cambiar-clave", h(async (req, res) => {
    const { actual, nueva } = req.body;
    await validarClaveNueva(nueva);
    const [[u]] = await db.query("SELECT passw FROM usuario WHERE id_user = ?", [req.usuario.id_user]);
    if (!verificar(actual, u.passw).ok) return res.status(400).json({ message: "La contraseña actual no es correcta" });
    if (actual === nueva) return res.status(400).json({ message: "La nueva contraseña debe ser distinta" });
    await db.query("UPDATE usuario SET passw = ?, debe_cambiar_clave = 0 WHERE id_user = ?",
        [cifrar(nueva), req.usuario.id_user]);
    res.json({ message: "Contraseña actualizada" });
}));

// POLÍTICA DE CONTRASEÑAS (pública: la usa la pantalla de login para mostrar los requisitos)
router.get("/politica-clave", h(async (req, res) => {
    res.json(await obtenerPolitica());
}));

// CONFIGURACIÓN (monto de aprobación de compras, política de contraseñas)
router.get("/configuracion", h(async (req, res) => {
    const [rows] = await db.query("SELECT clave, valor, descripcion FROM Configuracion");
    res.json(Object.fromEntries(rows.map(r => [r.clave, r.valor])));
}));

router.put("/configuracion", h(async (req, res) => {
    const b = req.body, cambios = [];
    if (b.monto_aprobacion_compras !== undefined) {
        const monto = Number(b.monto_aprobacion_compras);
        if (!(monto >= 0)) return res.status(400).json({ message: "Monto inválido" });
        cambios.push(["monto_aprobacion_compras", String(monto)]);
    }
    if (b.clave_min_longitud !== undefined) {
        const min = parseInt(b.clave_min_longitud, 10);
        if (!(min >= 8 && min <= 64))
            return res.status(400).json({ message: "La longitud mínima debe estar entre 8 y 64 caracteres" });
        cambios.push(["clave_min_longitud", String(min)]);
    }
    for (const k of ["clave_requiere_letra", "clave_requiere_numero", "clave_requiere_mayuscula", "clave_requiere_simbolo"])
        if (b[k] !== undefined) cambios.push([k, b[k] ? "1" : "0"]);

    for (const [clave, valor] of cambios)
        await db.query(`INSERT INTO Configuracion (clave, valor) VALUES (?, ?)
                        ON DUPLICATE KEY UPDATE valor = VALUES(valor)`, [clave, valor]);
    res.json({ message: "Configuración guardada" });
}));

module.exports = router;
