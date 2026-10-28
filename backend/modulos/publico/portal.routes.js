// =========================================================
// PORTAL DE CLIENTES  (sitio: site/login.html y site/consulta_ord.html)
//
// Sesión PROPIA del cliente (req.session.clienteId), independiente de la de
// trabajadores (req.session.userId): un cliente nunca entra al sistema interno.
//
//   POST /portal/registro   { cedula, celular, correo, clave }   activar cuenta
//   POST /portal/login      { usuario (correo o cédula), clave }
//   GET  /portal/sesion
//   POST /portal/logout
//   POST /portal/orden      { orden }   → estado de SU orden (requiere sesión)
//   POST /portal/cambiar-clave { actual, nueva }
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db").promise();
const { cifrar, verificar, validarClaveNueva } = require("../auth/seguridad");
const { normalizarCedula, normalizarCorreo, detalleOrdenCliente } = require("./cliente_util");

const h = fn => (req, res, next) => fn(req, res, next).catch(next);
const err = (status, message) => Object.assign(new Error(message), { status });

// ---------- límite de intentos fallidos (por IP) ----------
const VENTANA_MS = 15 * 60 * 1000, MAX_FALLOS = 8;
const fallos = new Map();
function revisarBloqueo(req) {
    const f = fallos.get(req.ip);
    if (f && f.hasta > Date.now() && f.n >= MAX_FALLOS)
        throw err(429, "Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.");
}
function fallo(req) {
    const f = fallos.get(req.ip);
    if (!f || f.hasta < Date.now()) fallos.set(req.ip, { n: 1, hasta: Date.now() + VENTANA_MS });
    else f.n++;
}
setInterval(() => { const t = Date.now(); for (const [k, f] of fallos) if (f.hasta < t) fallos.delete(k); }, VENTANA_MS).unref();

// ---------- sesión del cliente ----------
async function clienteActual(req) {
    if (!req.session?.clienteId) return null;
    const [[c]] = await db.query(
        "SELECT id_client, pr_name, pr_lastname, correo, portal_activo, passw IS NOT NULL AS tiene_cuenta FROM Clientes WHERE id_client = ?",
        [req.session.clienteId]);
    if (!c || !c.portal_activo || !c.tiene_cuenta) { delete req.session.clienteId; return null; }
    return c;
}
async function exigirCliente(req) {
    const c = await clienteActual(req);
    if (!c) throw err(401, "Inicie sesión para consultar sus órdenes");
    return c;
}

// =========================================================
// ACTIVAR CUENTA
// El cliente debe estar registrado en el taller con esa cédula y ese celular.
// =========================================================
router.post("/portal/registro", h(async (req, res) => {
    revisarBloqueo(req);
    const cedula = normalizarCedula(req.body.cedula);
    const correo = normalizarCorreo(req.body.correo);
    const celular = String(req.body.celular || "").replace(/\D/g, "");
    if (!cedula) throw err(400, "Escriba su cédula completa. Ejemplo: 001-010190-0001A");
    if (celular.length !== 8) throw err(400, "Escriba su celular de 8 dígitos");
    if (!correo) throw err(400, "Escriba un correo válido");
    await validarClaveNueva(req.body.clave);

    const [[c]] = await db.query("SELECT id_client, celular, passw, portal_activo FROM Clientes WHERE cedula = ?", [cedula]);
    if (!c || c.celular !== celular) {
        fallo(req);
        throw err(404, "No encontramos un cliente con esa cédula y ese celular. Verifique los datos o pida en el taller que los actualicen.");
    }
    if (c.passw) throw err(409, "Esta cédula ya tiene una cuenta. Inicie sesión, o pida en el taller restablecer su acceso.");
    if (!c.portal_activo) throw err(403, "El acceso de esta cuenta está bloqueado. Comuníquese con el taller.");

    const [[otro]] = await db.query("SELECT id_client FROM Clientes WHERE correo = ? AND id_client <> ?", [correo, c.id_client]);
    if (otro) throw err(409, "Ese correo ya está registrado con otra cuenta");

    await db.query("UPDATE Clientes SET correo = ?, passw = ?, portal_ultimo_acceso = NOW() WHERE id_client = ?",
        [correo, cifrar(req.body.clave), c.id_client]);

    req.session.regenerate(e => {
        if (e) return res.status(500).json({ message: "Error de sesión" });
        req.session.clienteId = c.id_client;
        res.json({ message: "Cuenta activada" });
    });
}));

// =========================================================
// LOGIN  { usuario: correo o cédula, clave }
// =========================================================
router.post("/portal/login", h(async (req, res) => {
    revisarBloqueo(req);
    const usuario = String(req.body.usuario || "").trim();
    const clave = String(req.body.clave || "");
    if (!usuario || !clave) throw err(400, "Escriba su correo o cédula y su contraseña");

    const cedula = normalizarCedula(usuario);
    const [[c]] = await db.query(
        `SELECT id_client, passw, portal_activo FROM Clientes WHERE ${cedula ? "cedula = ?" : "correo = ?"}`,
        [cedula || usuario.toLowerCase()]);

    const ok = c && c.passw && verificar(clave, c.passw).ok;
    if (!ok) {
        fallo(req);
        throw err(401, "Correo, cédula o contraseña incorrectos");
    }
    if (!c.portal_activo) throw err(403, "El acceso de esta cuenta está bloqueado. Comuníquese con el taller.");

    await db.query("UPDATE Clientes SET portal_ultimo_acceso = NOW() WHERE id_client = ?", [c.id_client]);
    req.session.regenerate(e => {
        if (e) return res.status(500).json({ message: "Error de sesión" });
        req.session.clienteId = c.id_client;
        res.json({ message: "Bienvenido" });
    });
}));

router.get("/portal/sesion", h(async (req, res) => {
    const c = await clienteActual(req);
    if (!c) return res.json({ loggedIn: false });
    res.json({ loggedIn: true, cliente: { nombre: c.pr_name, apellido: c.pr_lastname, correo: c.correo } });
}));

router.post("/portal/logout", (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ message: "Sesión cerrada" });
    });
});

// =========================================================
// CONSULTAR UNA ORDEN (solo si es del cliente que inició sesión)
// =========================================================
router.post("/portal/orden", h(async (req, res) => {
    const c = await exigirCliente(req);
    const orden = parseInt(String(req.body.orden || "").replace(/\D/g, ""), 10);
    if (!orden) throw err(400, "Escriba el número de su orden de trabajo");
    const d = await detalleOrdenCliente(orden, c.id_client);
    if (!d) throw err(404, `No encontramos la orden N.º ${orden} a su nombre. Revise el número en su comprobante de recepción.`);
    res.json(d);
}));

// CAMBIAR CONTRASEÑA
router.post("/portal/cambiar-clave", h(async (req, res) => {
    const c = await exigirCliente(req);
    const { actual, nueva } = req.body;
    await validarClaveNueva(nueva);
    const [[x]] = await db.query("SELECT passw FROM Clientes WHERE id_client = ?", [c.id_client]);
    if (!verificar(actual, x.passw).ok) throw err(400, "La contraseña actual no es correcta");
    await db.query("UPDATE Clientes SET passw = ? WHERE id_client = ?", [cifrar(nueva), c.id_client]);
    res.json({ message: "Contraseña actualizada" });
}));

module.exports = router;
