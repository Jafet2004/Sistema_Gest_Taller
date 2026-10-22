// =========================================================
// Gestión de compras → Pedidos de compra y recepción
//
//   Stock ≤ mínimo → SUGERENCIA → pedido BORRADOR (uno por proveedor)
//     → ENVIADA al proveedor → RECIBIDA (suma stock, recalcula costo, kardex)
//     (BORRADOR también puede recibirse directo = compra directa)
//     → opcional: pago como EGRESO de la caja abierta
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db").promise();
const { entradaCompra } = require("./stock");
const { puede } = require("../auth/seguridad");

const h = fn => (req, res, next) => fn(req, res, next).catch(next);
const err = (status, message) => Object.assign(new Error(message), { status });
const r2 = n => Math.round(Number(n || 0) * 100) / 100;
const FMT = "%Y-%m-%d %H:%i:%s";
const METODOS = ["EFECTIVO", "TARJETA", "TRANSFERENCIA"];

const SELECT_COMPRA = `
    SELECT c.id_compra, c.id_proveedor, c.estado, c.numero_factura, c.observaciones,
           DATE_FORMAT(c.fecha, '${FMT}') AS fecha,
           DATE_FORMAT(c.fecha_recepcion, '${FMT}') AS fecha_recepcion,
           pr.nombre AS proveedor, pr.telefono AS proveedor_tel,
           (SELECT COUNT(*) FROM Compra_Detalle d WHERE d.id_compra = c.id_compra) AS items,
           (SELECT COALESCE(SUM(COALESCE(d.cantidad_recibida, d.cantidad) * d.costo_unit), 0)
              FROM Compra_Detalle d WHERE d.id_compra = c.id_compra) AS total,
           (SELECT COALESCE(SUM(m.monto), 0) FROM Caja_Movimiento m
             WHERE m.id_compra = c.id_compra AND m.tipo = 'EGRESO') AS pagado_caja,
           c.aprobada_por, ua.name_user AS aprobada_por_nombre,
           DATE_FORMAT(c.fecha_aprobacion, '${FMT}') AS fecha_aprobacion
    FROM Compra c
    JOIN Proveedor pr ON pr.id_proveedor = c.id_proveedor
    LEFT JOIN usuario ua ON ua.id_user = c.aprobada_por`;

// ---------- Aprobación por monto (Configuracion.monto_aprobacion_compras) ----------
async function limiteAprobacion(conn = db) {
    const [[c]] = await conn.query("SELECT valor FROM Configuracion WHERE clave = 'monto_aprobacion_compras'");
    return Number(c ? c.valor : 0);
}
async function totalPedido(conn, id_compra) {
    const [[t]] = await conn.query(
        "SELECT COALESCE(SUM(cantidad * costo_unit), 0) AS total FROM Compra_Detalle WHERE id_compra = ?", [id_compra]);
    return Number(t.total);
}
/** Lanza 403 si la compra supera el límite y no está aprobada */
async function exigirAprobacion(conn, compra) {
    const limite = await limiteAprobacion(conn);
    const total = await totalPedido(conn, compra.id_compra);
    if (limite > 0 && total > limite && !compra.aprobada_por)
        throw err(403, `Esta compra (C$ ${total.toFixed(2)}) supera el límite de C$ ${limite.toFixed(2)}: requiere aprobación del Gerente`);
}

async function obtenerCompra(id, conn = db) {
    const [[c]] = await conn.query(`${SELECT_COMPRA} WHERE c.id_compra = ?`, [id]);
    if (!c) throw err(404, "Compra no encontrada");
    const [detalle] = await conn.query(`
        SELECT d.*, p.codigo, p.nombre, p.unidad, p.stock, p.stock_minimo
        FROM Compra_Detalle d JOIN Producto p ON p.id_producto = d.id_producto
        WHERE d.id_compra = ? ORDER BY d.id_detalle`, [id]);
    const limite = await limiteAprobacion(conn);
    const totalPed = detalle.reduce((a, d) => a + Number(d.cantidad) * Number(d.costo_unit), 0);
    return { ...c, detalle, limite_aprobacion: limite, requiere_aprobacion: limite > 0 && totalPed > limite && !c.aprobada_por };
}

function validarItems(items) {
    if (!Array.isArray(items) || !items.length) throw err(400, "Agregue al menos un producto");
    const ids = new Set();
    for (const it of items) {
        if (!it.id_producto) throw err(400, "Hay una línea sin producto");
        if (!(Number(it.cantidad) > 0)) throw err(400, "Las cantidades deben ser mayores que 0");
        if (Number(it.costo_unit) < 0) throw err(400, "El costo no puede ser negativo");
        if (ids.has(Number(it.id_producto))) throw err(400, "Hay un producto repetido en el pedido");
        ids.add(Number(it.id_producto));
    }
}

async function insertarItems(conn, id_compra, items) {
    await conn.query(
        "INSERT INTO Compra_Detalle (id_compra, id_producto, cantidad, costo_unit) VALUES ?",
        [items.map(it => [id_compra, it.id_producto, r2(it.cantidad), r2(it.costo_unit)])]);
}

// =========================================================
// SUGERENCIAS de reabastecimiento
// Cantidad sugerida = llevar el stock al DOBLE del mínimo, menos lo que ya viene en pedidos abiertos
// =========================================================
router.get("/compras/sugerencias", h(async (req, res) => {
    const [rows] = await db.query(`
        SELECT p.id_producto, p.codigo, p.nombre, p.unidad, p.stock, p.stock_minimo, p.costo_promedio,
               p.id_proveedor, pr.nombre AS proveedor,
               COALESCE(pend.cant, 0) AS en_pedido
        FROM Producto p
        LEFT JOIN Proveedor pr ON pr.id_proveedor = p.id_proveedor
        LEFT JOIN (SELECT d.id_producto, SUM(d.cantidad) AS cant
                     FROM Compra_Detalle d JOIN Compra c ON c.id_compra = d.id_compra
                    WHERE c.estado IN ('BORRADOR','ENVIADA') GROUP BY d.id_producto) pend
               ON pend.id_producto = p.id_producto
        WHERE p.activo = 1 AND p.stock <= p.stock_minimo
        ORDER BY pr.nombre, p.nombre`);
    rows.forEach(p => {
        p.sugerido = Math.max(Math.ceil(Number(p.stock_minimo) * 2 - Number(p.stock) - Number(p.en_pedido)), 0);
    });
    res.json(rows);
}));

// Genera pedidos BORRADOR agrupados por proveedor  { items: [{id_producto, cantidad, id_proveedor, costo_unit}] }
router.post("/compras/generar", h(async (req, res) => {
    const items = (req.body.items || []).filter(it => Number(it.cantidad) > 0);
    validarItems(items);
    if (items.some(it => !it.id_proveedor)) throw err(400, "Asigne un proveedor a cada producto");

    const porProveedor = {};
    items.forEach(it => (porProveedor[it.id_proveedor] ??= []).push(it));

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const creadas = [];
        for (const [id_proveedor, lista] of Object.entries(porProveedor)) {
            const [r] = await conn.query(
                "INSERT INTO Compra (id_proveedor, observaciones) VALUES (?, 'Generado por stock mínimo')",
                [id_proveedor]);
            await insertarItems(conn, r.insertId, lista);
            creadas.push(r.insertId);
        }
        await conn.commit();
        res.json({ message: `${creadas.length} pedido(s) de compra generado(s)`, compras: creadas });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
}));

// =========================================================
// CRUD de pedidos
// =========================================================
router.get("/compras", h(async (req, res) => {
    const estado = req.query.estado || "abiertas";
    let where = "", params = [];
    if (estado === "abiertas") where = "WHERE c.estado IN ('BORRADOR','ENVIADA')";
    else if (estado !== "todas") { where = "WHERE c.estado = ?"; params = [estado]; }
    const [rows] = await db.query(`${SELECT_COMPRA} ${where} ORDER BY c.id_compra DESC LIMIT 200`, params);
    res.json(rows);
}));

router.get("/compras/:id", h(async (req, res) => {
    res.json(await obtenerCompra(req.params.id));
}));

// Nuevo pedido o compra directa  { id_proveedor, items, observaciones }
router.post("/compras", h(async (req, res) => {
    const { id_proveedor, items, observaciones } = req.body;
    if (!id_proveedor) throw err(400, "Seleccione el proveedor");
    validarItems(items);
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [r] = await conn.query(
            "INSERT INTO Compra (id_proveedor, observaciones) VALUES (?, ?)", [id_proveedor, observaciones || null]);
        await insertarItems(conn, r.insertId, items);
        await conn.commit();
        res.json({ message: "Pedido de compra creado", id_compra: r.insertId });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
}));

// Editar (solo BORRADOR): reemplaza las líneas
router.put("/compras/:id", h(async (req, res) => {
    const { id_proveedor, items, observaciones } = req.body;
    validarItems(items);
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[c]] = await conn.query("SELECT estado FROM Compra WHERE id_compra = ? FOR UPDATE", [req.params.id]);
        if (!c) throw err(404, "Compra no encontrada");
        if (c.estado !== "BORRADOR") throw err(400, "Solo se pueden editar pedidos en borrador");
        // Si cambia el pedido, la aprobación anterior deja de valer
        await conn.query("UPDATE Compra SET id_proveedor = ?, observaciones = ?, aprobada_por = NULL, fecha_aprobacion = NULL WHERE id_compra = ?",
            [id_proveedor, observaciones || null, req.params.id]);
        await conn.query("DELETE FROM Compra_Detalle WHERE id_compra = ?", [req.params.id]);
        await insertarItems(conn, req.params.id, items);
        await conn.commit();
        res.json({ message: "Pedido actualizado" });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
}));

// Cambiar estado: BORRADOR → ENVIADA ; BORRADOR/ENVIADA → CANCELADA
router.put("/compras/:id/estado", h(async (req, res) => {
    const nuevo = req.body.estado;
    const permitidos = { BORRADOR: ["ENVIADA", "CANCELADA"], ENVIADA: ["CANCELADA", "BORRADOR"] };
    const [[c]] = await db.query("SELECT id_compra, estado, aprobada_por FROM Compra WHERE id_compra = ?", [req.params.id]);
    if (!c) throw err(404, "Compra no encontrada");
    if (!(permitidos[c.estado] || []).includes(nuevo))
        throw err(400, `No se puede pasar de ${c.estado} a ${nuevo}`);
    if (nuevo === "ENVIADA") await exigirAprobacion(db, c);
    await db.query("UPDATE Compra SET estado = ? WHERE id_compra = ?", [nuevo, req.params.id]);
    res.json({ message: nuevo === "ENVIADA" ? "Pedido marcado como enviado al proveedor" : `Pedido ${nuevo.toLowerCase()}` });
}));

// =========================================================
// RECIBIR la compra en bodega
// { numero_factura, items: [{id_detalle, cantidad_recibida, costo_unit}],
//   pagar_con_caja: true|false, metodo_pago, referencia }
// =========================================================
router.post("/compras/:id/recibir", h(async (req, res) => {
    const { numero_factura, pagar_con_caja, metodo_pago = "EFECTIVO", referencia } = req.body;
    const recibidos = req.body.items || [];
    if (pagar_con_caja && !METODOS.includes(metodo_pago)) throw err(400, "Método de pago inválido");

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[c]] = await conn.query("SELECT * FROM Compra WHERE id_compra = ? FOR UPDATE", [req.params.id]);
        if (!c) throw err(404, "Compra no encontrada");
        if (!["BORRADOR", "ENVIADA"].includes(c.estado)) throw err(400, `La compra está ${c.estado}`);
        await exigirAprobacion(conn, c);
        if (pagar_con_caja && !puede(req.usuario, "compras.pagar"))
            throw err(403, "No tiene permiso para pagar compras desde la caja");

        const [detalle] = await conn.query("SELECT * FROM Compra_Detalle WHERE id_compra = ?", [c.id_compra]);
        let total = 0, lineas = 0;
        for (const d of detalle) {
            const it = recibidos.find(x => Number(x.id_detalle) === d.id_detalle) || {};
            const cant = it.cantidad_recibida !== undefined ? r2(it.cantidad_recibida) : Number(d.cantidad);
            const costo = it.costo_unit !== undefined ? r2(it.costo_unit) : Number(d.costo_unit);
            if (cant < 0 || costo < 0) throw err(400, "Cantidades y costos no pueden ser negativos");
            await conn.query("UPDATE Compra_Detalle SET cantidad_recibida = ?, costo_unit = ? WHERE id_detalle = ?",
                [cant, costo, d.id_detalle]);
            if (cant > 0) {
                await entradaCompra(conn, { id_producto: d.id_producto, cantidad: cant, costo_unit: costo, id_compra: c.id_compra });
                lineas++;
            }
            total += cant * costo;
        }
        if (!lineas) throw err(400, "No se recibió ningún producto");
        total = r2(total);

        await conn.query(
            "UPDATE Compra SET estado = 'RECIBIDA', fecha_recepcion = NOW(), numero_factura = ? WHERE id_compra = ?",
            [numero_factura || null, c.id_compra]);

        // Pago desde la caja abierta (queda como EGRESO enlazado a la compra)
        if (pagar_con_caja && total > 0)
            await registrarPagoCaja(conn, c, total, metodo_pago, referencia, numero_factura);

        await conn.commit();
        res.json({ message: `Compra recibida: ${lineas} producto(s) ingresaron al inventario`, total });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
}));

// Registra el pago de una compra como EGRESO de la caja abierta
async function registrarPagoCaja(conn, c, total, metodo_pago, referencia, numero_factura) {
    if (!METODOS.includes(metodo_pago)) throw err(400, "Método de pago inválido");
    const [[s]] = await conn.query(
        "SELECT id_sesion, monto_apertura FROM Caja_Sesion WHERE estado = 'ABIERTA' ORDER BY id_sesion DESC LIMIT 1 FOR UPDATE");
    if (!s) throw err(409, "No hay caja abierta para pagar la compra.");
    if (metodo_pago === "EFECTIVO") {
        const [[e]] = await conn.query(`
            SELECT COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END), 0) AS neto
            FROM Caja_Movimiento WHERE id_sesion = ? AND metodo_pago = 'EFECTIVO'`, [s.id_sesion]);
        const disponible = r2(Number(s.monto_apertura) + Number(e.neto));
        if (total > disponible)
            throw err(400, `No hay suficiente efectivo en caja (C$ ${disponible.toFixed(2)}) para pagar C$ ${total.toFixed(2)}`);
    } else if (!referencia) {
        throw err(400, "Ingrese la referencia del pago con tarjeta o transferencia");
    }
    const [[pv]] = await conn.query("SELECT nombre FROM Proveedor WHERE id_proveedor = ?", [c.id_proveedor]);
    await conn.query(
        `INSERT INTO Caja_Movimiento (id_sesion, id_compra, tipo, concepto, metodo_pago, monto, referencia)
         VALUES (?, ?, 'EGRESO', ?, ?, ?, ?)`,
        [s.id_sesion, c.id_compra,
         `Compra #${c.id_compra} a ${pv.nombre}${numero_factura || c.numero_factura ? ` (fact. ${numero_factura || c.numero_factura})` : ""}`,
         metodo_pago, total, referencia || null]);
}

// APROBAR (Gerente)
router.put("/compras/:id/aprobar", h(async (req, res) => {
    const [r] = await db.query(
        "UPDATE Compra SET aprobada_por = ?, fecha_aprobacion = NOW() WHERE id_compra = ? AND estado IN ('BORRADOR','ENVIADA')",
        [req.usuario.id_user, req.params.id]);
    if (!r.affectedRows) throw err(400, "Solo se aprueban pedidos en borrador o enviados");
    res.json({ message: "Compra aprobada" });
}));

// PAGAR una compra ya recibida desde la caja (Administración y Finanzas)  { metodo_pago, referencia }
router.post("/compras/:id/pagar", h(async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[c]] = await conn.query("SELECT * FROM Compra WHERE id_compra = ? FOR UPDATE", [req.params.id]);
        if (!c) throw err(404, "Compra no encontrada");
        if (c.estado !== "RECIBIDA") throw err(400, "Solo se pagan compras recibidas");
        const [[t]] = await conn.query(`
            SELECT COALESCE(SUM(cantidad_recibida * costo_unit), 0) AS total,
                   (SELECT COALESCE(SUM(monto),0) FROM Caja_Movimiento WHERE id_compra = ? AND tipo = 'EGRESO') AS pagado
            FROM Compra_Detalle WHERE id_compra = ?`, [c.id_compra, c.id_compra]);
        const saldo = r2(Number(t.total) - Number(t.pagado));
        if (saldo <= 0) throw err(400, "Esta compra ya está pagada");
        await registrarPagoCaja(conn, c, saldo, req.body.metodo_pago || "EFECTIVO", req.body.referencia, null);
        await conn.commit();
        res.json({ message: `Pago de C$ ${saldo.toFixed(2)} registrado en caja` });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
}));

module.exports = router;
