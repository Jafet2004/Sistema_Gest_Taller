// =========================================================
// Gestión de cliente → Clientes
// (incluye cédula y correo, usados por el portal de clientes)
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db").promise();
const { normalizarCedula, normalizarCorreo } = require("../publico/cliente_util");

const h = fn => (req, res, next) => fn(req, res, next).catch(next);
const err = (status, message) => Object.assign(new Error(message), { status });

// Nunca se envía la contraseña del cliente: solo si ya activó su cuenta
const COLUMNAS = `c.id_client, c.pr_name, c.sc_name, c.pr_lastname, c.sc_lastname, c.cedula,
                  c.celular, c.correo, c.portal_activo, (c.passw IS NOT NULL) AS tiene_cuenta,
                  DATE_FORMAT(c.portal_ultimo_acceso, '%Y-%m-%d %H:%i') AS portal_ultimo_acceso`;

function datosCliente(b) {
    const { pr_name, sc_name, pr_lastname, sc_lastname, celular } = b;
    if (!pr_name || !sc_name || !pr_lastname || !sc_lastname || !celular)
        throw err(400, "Nombres, apellidos y celular son obligatorios");
    let cedula = null, correo = null;
    if (b.cedula && String(b.cedula).trim()) {
        cedula = normalizarCedula(b.cedula);
        if (!cedula) throw err(400, "Cédula inválida. Formato: 001-010190-0001A");
    }
    if (b.correo && String(b.correo).trim()) {
        correo = normalizarCorreo(b.correo);
        if (!correo) throw err(400, "Correo inválido");
    }
    return [pr_name.trim(), sc_name.trim(), pr_lastname.trim(), sc_lastname.trim(), cedula, String(celular).trim(), correo];
}

function errorBD(e) {
    if (e.code === "ER_DUP_ENTRY") {
        if (/cedula/i.test(e.message)) return err(409, "Ya existe un cliente con esa cédula");
        if (/correo/i.test(e.message)) return err(409, "Ya existe un cliente con ese correo");
    }
    if (e.code === "ER_CHECK_CONSTRAINT_VIOLATED") {
        if (/cel/i.test(e.message)) return err(400, "Celular inválido: 8 dígitos y debe iniciar con 5, 7 u 8");
        return err(400, "Algún dato no tiene el formato correcto");
    }
    return e;
}

// =========================================================
// CRUD
// =========================================================
router.get("/clientes", h(async (req, res) => {
    const [rows] = await db.query(`SELECT ${COLUMNAS} FROM Clientes c ORDER BY c.pr_name, c.pr_lastname`);
    res.json(rows);
}));

router.post("/clientes", h(async (req, res) => {
    try {
        const [r] = await db.query(
            `INSERT INTO Clientes (pr_name, sc_name, pr_lastname, sc_lastname, cedula, celular, correo)
             VALUES (?, ?, ?, ?, ?, ?, ?)`, datosCliente(req.body));
        // Devolvemos el id para poder seleccionarlo de inmediato (flujo de registro de vehículo)
        res.json({ message: "Cliente creado", id_client: r.insertId });
    } catch (e) { throw errorBD(e); }
}));

router.put("/clientes/:id", h(async (req, res) => {
    try {
        const [r] = await db.query(
            `UPDATE Clientes SET pr_name=?, sc_name=?, pr_lastname=?, sc_lastname=?, cedula=?, celular=?, correo=?
             WHERE id_client=?`, [...datosCliente(req.body), req.params.id]);
        if (!r.affectedRows) throw err(404, "Cliente no encontrado");
        res.json({ message: "Cliente actualizado" });
    } catch (e) { throw errorBD(e); }
}));

router.delete("/clientes/:id", h(async (req, res) => {
    try {
        const [r] = await db.query("DELETE FROM Clientes WHERE id_client = ?", [req.params.id]);
        if (!r.affectedRows) throw err(404, "Cliente no encontrado");
        res.json({ message: "Cliente eliminado" });
    } catch (e) {
        if (e.code === "ER_ROW_IS_REFERENCED_2")
            throw err(409, "No se puede eliminar: el cliente tiene vehículos, órdenes o pagos registrados");
        throw e;
    }
}));

// =========================================================
// PORTAL: restablecer el acceso (olvidó su contraseña) o bloquearlo
// PUT /clientes/:id/portal  { accion: "restablecer" | "bloquear" | "desbloquear" }
// "restablecer" borra la contraseña: el cliente vuelve a activar su cuenta desde el sitio.
// =========================================================
router.put("/clientes/:id/portal", h(async (req, res) => {
    const acciones = {
        restablecer: ["UPDATE Clientes SET passw = NULL, portal_activo = 1 WHERE id_client = ?",
                      "Acceso restablecido: el cliente debe activar su cuenta de nuevo en el sitio"],
        bloquear:    ["UPDATE Clientes SET portal_activo = 0 WHERE id_client = ?", "Acceso al portal bloqueado"],
        desbloquear: ["UPDATE Clientes SET portal_activo = 1 WHERE id_client = ?", "Acceso al portal habilitado"]
    };
    const a = acciones[req.body.accion];
    if (!a) throw err(400, "Acción inválida");
    const [r] = await db.query(a[0], [req.params.id]);
    if (!r.affectedRows) throw err(404, "Cliente no encontrado");
    res.json({ message: a[1] });
}));

// =========================================================
// BUSCAR cliente (nombre, apellido, celular o cédula)
// GET /clientes/buscar?q=juan
// =========================================================
router.get("/clientes/buscar", h(async (req, res) => {
    const q = `%${(req.query.q || "").trim()}%`;
    const [rows] = await db.query(`
        SELECT ${COLUMNAS},
               (SELECT COUNT(*) FROM Vehiculos v WHERE v.id_client = c.id_client) AS total_vehiculos
        FROM Clientes c
        WHERE CONCAT_WS(' ', c.pr_name, c.sc_name, c.pr_lastname, c.sc_lastname) LIKE ?
           OR CONCAT_WS(' ', c.pr_name, c.pr_lastname) LIKE ?
           OR c.celular LIKE ? OR c.cedula LIKE ?
        ORDER BY c.pr_name, c.pr_lastname
        LIMIT 20`, [q, q, q, q]);
    res.json(rows);
}));

// =========================================================
// VEHÍCULOS DE UN CLIENTE (con su estado: en taller o disponible)
// GET /clientes/:id/vehiculos
// =========================================================
router.get("/clientes/:id/vehiculos", h(async (req, res) => {
    const [rows] = await db.query(`
        SELECT v.id_Vehic, v.Marca, v.Modelo, v.Año, v.Numero_chasis,
               o.id_orden AS orden_activa, o.estado AS estado_orden,
               (SELECT COUNT(*) FROM Orden_Servicio x WHERE x.id_Vehic = v.id_Vehic) AS visitas
        FROM Vehiculos v
        LEFT JOIN Orden_Servicio o
               ON o.id_Vehic = v.id_Vehic
              AND o.estado IN ('RECIBIDO','EN_PROCESO','TERMINADO')
        WHERE v.id_client = ?
        ORDER BY v.id_Vehic DESC`, [req.params.id]);
    res.json(rows);
}));

module.exports = router;
