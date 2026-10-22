// =========================================================
// MÓDULO CAJA
// Apertura → Pagos / Egresos → Arqueo → Cierre → Depósito del día
// Montado en server.js como:  app.use("/caja", ...)
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db").promise(); // versión async/await del mismo pool

// Envuelve rutas async para que los errores lleguen al manejador de server.js
const h = fn => (req, res, next) => fn(req, res, next).catch(next);
const err = (status, message) => Object.assign(new Error(message), { status });
const num = v => Math.round(Number(v || 0) * 100) / 100;

const METODOS = ["EFECTIVO", "TARJETA", "TRANSFERENCIA"];
const FMT = "%Y-%m-%d %H:%i:%s"; // fechas como texto local, sin conversión a UTC

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
async function sesionAbierta(conn = db) {
    const [rows] = await conn.query(
        `SELECT *, DATE_FORMAT(fecha_apertura, '${FMT}') AS fecha_apertura
         FROM Caja_Sesion WHERE estado = 'ABIERTA' ORDER BY id_sesion DESC LIMIT 1`
    );
    return rows[0] || null;
}

// Resumen de una sesión: totales por tipo y método + efectivo esperado en gaveta
async function resumenSesion(sesion, conn = db) {
    const [rows] = await conn.query(
        `SELECT tipo, metodo_pago, COALESCE(SUM(monto),0) AS total, COUNT(*) AS cantidad
         FROM Caja_Movimiento WHERE id_sesion = ?
         GROUP BY tipo, metodo_pago`,
        [sesion.id_sesion]
    );
    const r = {
        apertura: num(sesion.monto_apertura),
        ingresos: { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, total: 0 },
        egresos:  { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, total: 0 },
        cantidadMovimientos: 0
    };
    rows.forEach(x => {
        const grupo = x.tipo === "INGRESO" ? r.ingresos : r.egresos;
        grupo[x.metodo_pago] = num(x.total);
        grupo.total = num(grupo.total + Number(x.total));
        r.cantidadMovimientos += x.cantidad;
    });
    // Solo el EFECTIVO queda físicamente en la gaveta
    r.efectivoEsperado = num(r.apertura + r.ingresos.EFECTIVO - r.egresos.EFECTIVO);
    return r;
}

function totalDenominaciones(detalle) {
    if (!detalle || typeof detalle !== "object") return null;
    return num(Object.entries(detalle).reduce(
        (s, [valor, cant]) => s + Number(valor) * Number(cant || 0), 0
    ));
}

// =========================================================
// ESTADO ACTUAL
// GET /caja/actual  → { abierta, sesion, resumen }
// =========================================================
router.get("/actual", h(async (req, res) => {
    const sesion = await sesionAbierta();
    if (!sesion) return res.json({ abierta: false });
    res.json({ abierta: true, sesion, resumen: await resumenSesion(sesion) });
}));

// =========================================================
// 1. APERTURA
// POST /caja/apertura  { monto_apertura, observaciones }
// =========================================================
router.post("/apertura", h(async (req, res) => {
    const monto = num(req.body.monto_apertura);
    if (!(monto >= 0)) throw err(400, "Monto de apertura inválido");

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [abiertas] = await conn.query(
            "SELECT id_sesion FROM Caja_Sesion WHERE estado='ABIERTA' FOR UPDATE"
        );
        if (abiertas.length) throw err(409, "Ya hay una caja abierta. Ciérrela antes de abrir otra.");

        const [r] = await conn.query(
            `INSERT INTO Caja_Sesion (id_user, monto_apertura, observaciones) VALUES (?, ?, ?)`,
            [req.session?.userId || null, monto, req.body.observaciones || null]
        );
        await conn.commit();
        res.json({ message: "Caja abierta correctamente", id_sesion: r.insertId });
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}));

// =========================================================
// 2. PAGOS
// GET  /caja/pendientes  → órdenes de servicio con saldo por cobrar
// POST /caja/pagos       { id_orden, monto, metodo_pago, referencia }
// =========================================================
router.get("/pendientes", h(async (req, res) => {
    // Órdenes (no canceladas) cuyo total (servicios + repuestos cobrados) aún no está pagado
    const [rows] = await db.query(`
        SELECT o.id_orden, o.id_Vehic, o.estado, v.Marca, v.Modelo, v.Numero_chasis, o.id_client,
               CONCAT(c.pr_name, ' ', c.pr_lastname) AS cliente,
               (SELECT GROUP_CONCAT(t.Name_trabajo SEPARATOR ', ')
                  FROM Orden_Servicio_Detalle d JOIN List_Trabajo t ON t.id_trabajo = d.id_trabajo
                 WHERE d.id_orden = o.id_orden) AS Name_trabajo,
               vt.total AS Total, vt.pagado,
               ROUND(vt.total - vt.pagado, 2) AS saldo
        FROM Orden_Servicio o
        JOIN v_orden_total vt ON vt.id_orden = o.id_orden
        JOIN Vehiculos v ON v.id_Vehic  = o.id_Vehic
        JOIN Clientes  c ON c.id_client = o.id_client
        WHERE o.estado <> 'CANCELADO' AND vt.total - vt.pagado > 0
        ORDER BY o.id_orden DESC
    `);
    res.json(rows);
}));

router.post("/pagos", h(async (req, res) => {
    const { id_orden, metodo_pago = "EFECTIVO", referencia } = req.body;
    const monto = num(req.body.monto);

    if (!id_orden) throw err(400, "Seleccione la orden de servicio a cobrar");
    if (!(monto > 0)) throw err(400, "El monto debe ser mayor que 0");
    if (!METODOS.includes(metodo_pago)) throw err(400, "Método de pago inválido");
    if (metodo_pago !== "EFECTIVO" && !referencia)
        throw err(400, "Ingrese la referencia (voucher / nº de transferencia)");

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const sesion = await sesionAbierta(conn);
        if (!sesion) throw err(409, "No hay caja abierta. Realice la apertura primero.");

        // Bloquea la orden para evitar doble cobro simultáneo; el total sale de la vista
        await conn.query("SELECT id_orden FROM Orden_Servicio WHERE id_orden = ? FOR UPDATE", [id_orden]);
        const [[o]] = await conn.query(`
            SELECT o.id_orden, o.id_Vehic, o.id_client, o.estado, v.Marca, v.Modelo, vt.total, vt.pagado
            FROM Orden_Servicio o
            JOIN v_orden_total vt ON vt.id_orden = o.id_orden
            JOIN Vehiculos v ON v.id_Vehic = o.id_Vehic
            WHERE o.id_orden = ?`, [id_orden]);
        if (!o) throw err(404, "Orden no encontrada");
        if (o.estado === "CANCELADO") throw err(400, "La orden está cancelada");

        const saldo = num(o.total - o.pagado);
        if (saldo <= 0) throw err(400, "Esta orden ya está pagada");
        if (monto > saldo) throw err(400, `El monto excede el saldo pendiente (C$ ${saldo.toFixed(2)})`);

        const [r] = await conn.query(
            `INSERT INTO Caja_Movimiento
             (id_sesion, id_orden, tipo, concepto, metodo_pago, monto, referencia, id_Vehic, id_client)
             VALUES (?, ?, 'INGRESO', ?, ?, ?, ?, ?, ?)`,
            [sesion.id_sesion, o.id_orden, `Pago orden #${o.id_orden} (${o.Marca} ${o.Modelo})`,
             metodo_pago, monto, referencia || null, o.id_Vehic, o.id_client]
        );
        await conn.commit();
        res.json({ message: "Pago registrado", id_mov: r.insertId, saldo_restante: num(saldo - monto) });
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}));

// =========================================================
// EGRESOS (gastos menores pagados desde la caja)
// POST /caja/egresos  { concepto, monto, metodo_pago }
// =========================================================
router.post("/egresos", h(async (req, res) => {
    const { concepto, metodo_pago = "EFECTIVO", referencia } = req.body;
    const monto = num(req.body.monto);
    if (!concepto) throw err(400, "Indique el concepto del egreso");
    if (!(monto > 0)) throw err(400, "El monto debe ser mayor que 0");
    if (!METODOS.includes(metodo_pago)) throw err(400, "Método de pago inválido");

    const sesion = await sesionAbierta();
    if (!sesion) throw err(409, "No hay caja abierta");

    if (metodo_pago === "EFECTIVO") {
        const { efectivoEsperado } = await resumenSesion(sesion);
        if (monto > efectivoEsperado)
            throw err(400, `No hay suficiente efectivo en caja (C$ ${efectivoEsperado.toFixed(2)})`);
    }

    await db.query(
        `INSERT INTO Caja_Movimiento (id_sesion, tipo, concepto, metodo_pago, monto, referencia)
         VALUES (?, 'EGRESO', ?, ?, ?, ?)`,
        [sesion.id_sesion, concepto, metodo_pago, monto, referencia || null]
    );
    res.json({ message: "Egreso registrado" });
}));

// =========================================================
// MOVIMIENTOS de una sesión (por defecto la abierta)
// GET /caja/movimientos?id_sesion=5
// =========================================================
router.get("/movimientos", h(async (req, res) => {
    let id = req.query.id_sesion;
    if (!id) {
        const s = await sesionAbierta();
        if (!s) return res.json([]);
        id = s.id_sesion;
    }
    const [rows] = await db.query(`
        SELECT m.id_mov, m.id_orden, m.tipo, m.concepto, m.metodo_pago, m.monto, m.referencia, m.id_Vehic,
               DATE_FORMAT(m.fecha, '${FMT}') AS fecha,
               CONCAT(c.pr_name, ' ', c.pr_lastname) AS cliente
        FROM Caja_Movimiento m
        LEFT JOIN Clientes c ON c.id_client = m.id_client
        WHERE m.id_sesion = ?
        ORDER BY m.id_mov DESC`, [id]);
    res.json(rows);
}));

// Anular un movimiento (solo si la caja sigue abierta)
router.delete("/movimientos/:id", h(async (req, res) => {
    const [r] = await db.query(`
        DELETE m FROM Caja_Movimiento m
        JOIN Caja_Sesion s ON s.id_sesion = m.id_sesion
        WHERE m.id_mov = ? AND s.estado = 'ABIERTA'`, [req.params.id]);
    if (!r.affectedRows) throw err(400, "No se puede anular: no existe o la caja ya está cerrada");
    res.json({ message: "Movimiento anulado" });
}));

// =========================================================
// 3. ARQUEO (conteo físico parcial; no cierra la caja)
// POST /caja/arqueo  { detalle: {"1000":2,"500":1,...} }  ó { efectivo_contado }
// =========================================================
router.post("/arqueo", h(async (req, res) => {
    const sesion = await sesionAbierta();
    if (!sesion) throw err(409, "No hay caja abierta");

    const contado = totalDenominaciones(req.body.detalle) ?? num(req.body.efectivo_contado);
    const { efectivoEsperado } = await resumenSesion(sesion);
    const diferencia = num(contado - efectivoEsperado);

    await db.query(
        `INSERT INTO Caja_Arqueo (id_sesion, tipo, efectivo_esperado, efectivo_contado, diferencia, detalle)
         VALUES (?, 'PARCIAL', ?, ?, ?, ?)`,
        [sesion.id_sesion, efectivoEsperado, contado, diferencia,
         req.body.detalle ? JSON.stringify(req.body.detalle) : null]
    );
    res.json({ message: "Arqueo registrado", efectivo_esperado: efectivoEsperado,
               efectivo_contado: contado, diferencia });
}));

// =========================================================
// 4. CIERRE (arqueo final + cerrar la sesión)
// POST /caja/cierre  { detalle | efectivo_contado, observaciones }
// =========================================================
router.post("/cierre", h(async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const sesion = await sesionAbierta(conn);
        if (!sesion) throw err(409, "No hay caja abierta");

        const resumen = await resumenSesion(sesion, conn);
        const contado = totalDenominaciones(req.body.detalle) ?? num(req.body.efectivo_contado);
        const diferencia = num(contado - resumen.efectivoEsperado);

        await conn.query(
            `INSERT INTO Caja_Arqueo (id_sesion, tipo, efectivo_esperado, efectivo_contado, diferencia, detalle)
             VALUES (?, 'CIERRE', ?, ?, ?, ?)`,
            [sesion.id_sesion, resumen.efectivoEsperado, contado, diferencia,
             req.body.detalle ? JSON.stringify(req.body.detalle) : null]
        );
        await conn.query(
            `UPDATE Caja_Sesion
             SET estado='CERRADA', fecha_cierre=NOW(), efectivo_esperado=?, efectivo_contado=?,
                 diferencia=?, observaciones=CONCAT_WS(' | ', observaciones, ?)
             WHERE id_sesion=?`,
            [resumen.efectivoEsperado, contado, diferencia, req.body.observaciones || null, sesion.id_sesion]
        );
        await conn.commit();
        res.json({ message: "Caja cerrada", id_sesion: sesion.id_sesion, resumen,
                   efectivo_contado: contado, diferencia });
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}));

// =========================================================
// 5. DEPÓSITO DEL DÍA (sobre una sesión ya cerrada)
// POST /caja/deposito  { id_sesion, banco, referencia, monto }
// =========================================================
router.post("/deposito", h(async (req, res) => {
    const { id_sesion, banco, referencia } = req.body;
    const monto = num(req.body.monto);
    if (!id_sesion || !banco || !referencia) throw err(400, "Complete sesión, banco y referencia");
    if (!(monto > 0)) throw err(400, "El monto debe ser mayor que 0");

    const [[s]] = await db.query(
        `SELECT s.estado, s.efectivo_contado,
                (SELECT COALESCE(SUM(monto),0) FROM Caja_Deposito WHERE id_sesion = s.id_sesion) AS depositado
         FROM Caja_Sesion s WHERE s.id_sesion = ?`, [id_sesion]);
    if (!s) throw err(404, "Sesión no encontrada");
    if (s.estado !== "CERRADA") throw err(400, "Primero cierre la caja de esa sesión");
    const disponible = num(s.efectivo_contado - s.depositado);
    if (monto > disponible)
        throw err(400, `El depósito excede el efectivo disponible de esa sesión (C$ ${disponible.toFixed(2)})`);

    await db.query(
        "INSERT INTO Caja_Deposito (id_sesion, banco, referencia, monto) VALUES (?, ?, ?, ?)",
        [id_sesion, banco, referencia, monto]
    );
    res.json({ message: "Depósito registrado" });
}));

// =========================================================
// HISTORIAL de sesiones (con totales y depósitos)
// GET /caja/historial
// =========================================================
router.get("/historial", h(async (req, res) => {
    const [rows] = await db.query(`
        SELECT s.id_sesion, s.estado, s.monto_apertura, s.efectivo_esperado,
               s.efectivo_contado, s.diferencia, s.observaciones,
               DATE_FORMAT(s.fecha_apertura, '${FMT}') AS fecha_apertura,
               DATE_FORMAT(s.fecha_cierre,   '${FMT}') AS fecha_cierre,
               u.name_user,
               (SELECT COALESCE(SUM(monto),0) FROM Caja_Movimiento
                 WHERE id_sesion = s.id_sesion AND tipo='INGRESO') AS total_ingresos,
               (SELECT COALESCE(SUM(monto),0) FROM Caja_Movimiento
                 WHERE id_sesion = s.id_sesion AND tipo='EGRESO')  AS total_egresos,
               (SELECT COALESCE(SUM(monto),0) FROM Caja_Deposito
                 WHERE id_sesion = s.id_sesion) AS depositado
        FROM Caja_Sesion s
        LEFT JOIN usuario u ON u.id_user = s.id_user
        ORDER BY s.id_sesion DESC
        LIMIT 60`);
    res.json(rows);
}));

// =========================================================
// CUENTAS POR COBRAR: vehículos ENTREGADOS con saldo pendiente
// GET /caja/cuentas-por-cobrar
// =========================================================
router.get("/cuentas-por-cobrar", h(async (req, res) => {
    const [rows] = await db.query(`
        SELECT o.id_orden, DATE_FORMAT(o.fecha_salida, '${FMT}') AS fecha_salida,
               DATEDIFF(CURDATE(), o.fecha_salida) AS dias,
               CONCAT(c.pr_name, ' ', c.pr_lastname) AS cliente, c.celular,
               v.Marca, v.Modelo, vt.total, vt.pagado, ROUND(vt.total - vt.pagado, 2) AS saldo
        FROM Orden_Servicio o
        JOIN v_orden_total vt ON vt.id_orden = o.id_orden
        JOIN Clientes c ON c.id_client = o.id_client
        JOIN Vehiculos v ON v.id_Vehic = o.id_Vehic
        WHERE o.estado = 'ENTREGADO' AND vt.total - vt.pagado > 0
        ORDER BY o.fecha_salida`);
    res.json(rows);
}));

module.exports = router;
