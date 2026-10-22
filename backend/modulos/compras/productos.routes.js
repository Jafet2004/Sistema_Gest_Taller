// =========================================================
// Gestión de compras → Productos (repuestos e insumos con stock)
// Las HERRAMIENTAS siguen en inventario.routes.js (/inventario), sin cambios.
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db").promise();
const { moverStock } = require("./stock");

const h = fn => (req, res, next) => fn(req, res, next).catch(next);
const err = (status, message) => Object.assign(new Error(message), { status });
const FMT = "%Y-%m-%d %H:%i:%s";

const SELECT_PRODUCTO = `
    SELECT p.*, pr.nombre AS proveedor,
           (p.stock <= p.stock_minimo) AS bajo_minimo,
           (SELECT COALESCE(SUM(cd.cantidad), 0)
              FROM Compra_Detalle cd JOIN Compra c ON c.id_compra = cd.id_compra
             WHERE cd.id_producto = p.id_producto AND c.estado IN ('BORRADOR','ENVIADA')) AS en_pedido
    FROM Producto p
    LEFT JOIN Proveedor pr ON pr.id_proveedor = p.id_proveedor`;

function validar(b) {
    if (!b.codigo || !b.nombre) throw err(400, "Código y nombre son obligatorios");
    for (const k of ["stock_minimo", "costo_promedio", "precio_venta"])
        if (b[k] !== undefined && b[k] !== "" && Number(b[k]) < 0) throw err(400, `${k} no puede ser negativo`);
}

// LISTA  GET /productos?bajo_minimo=1&activos=1
router.get("/productos", h(async (req, res) => {
    const where = [];
    if (req.query.activos !== "0") where.push("p.activo = 1");
    if (req.query.bajo_minimo === "1") where.push("p.stock <= p.stock_minimo");
    const [rows] = await db.query(
        `${SELECT_PRODUCTO} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.nombre`);
    res.json(rows);
}));

// ALERTAS de stock mínimo (para dashboard, inventario y compras)
router.get("/inventario/alertas", h(async (req, res) => {
    const [rows] = await db.query(
        `${SELECT_PRODUCTO} WHERE p.activo = 1 AND p.stock <= p.stock_minimo ORDER BY (p.stock - p.stock_minimo)`);
    res.json({ total: rows.length, productos: rows });
}));

router.get("/productos/:id", h(async (req, res) => {
    const [[p]] = await db.query(`${SELECT_PRODUCTO} WHERE p.id_producto = ?`, [req.params.id]);
    if (!p) throw err(404, "Producto no encontrado");
    res.json(p);
}));

// CREAR  (stock_inicial queda registrado en el kardex)
router.post("/productos", h(async (req, res) => {
    const b = req.body;
    validar(b);
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [r] = await conn.query(
            `INSERT INTO Producto (codigo, nombre, marca, unidad, stock, stock_minimo, costo_promedio, precio_venta, id_proveedor)
             VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
            [b.codigo.trim().toUpperCase(), b.nombre.trim(), b.marca || null, b.unidad || "unidad",
             Number(b.stock_minimo || 0), Number(b.costo_promedio || 0), Number(b.precio_venta || 0),
             b.id_proveedor || null]);
        if (Number(b.stock_inicial) > 0) {
            await moverStock(conn, { id_producto: r.insertId, delta: Number(b.stock_inicial), tipo: "INICIAL",
                                     costo_unit: Number(b.costo_promedio || 0), nota: "Stock inicial" });
        }
        await conn.commit();
        res.json({ message: "Producto registrado", id_producto: r.insertId });
    } catch (e) {
        await conn.rollback();
        if (e.code === "ER_DUP_ENTRY") throw err(409, "Ya existe un producto con ese código");
        throw e;
    } finally { conn.release(); }
}));

// EDITAR (el stock NO se edita aquí: se usa ajuste o compra, para que quede en el kardex)
router.put("/productos/:id", h(async (req, res) => {
    const b = req.body;
    validar(b);
    try {
        const [r] = await db.query(
            `UPDATE Producto SET codigo=?, nombre=?, marca=?, unidad=?, stock_minimo=?, precio_venta=?, id_proveedor=?, activo=?
             WHERE id_producto=?`,
            [b.codigo.trim().toUpperCase(), b.nombre.trim(), b.marca || null, b.unidad || "unidad",
             Number(b.stock_minimo || 0), Number(b.precio_venta || 0), b.id_proveedor || null,
             b.activo === 0 || b.activo === false ? 0 : 1, req.params.id]);
        if (!r.affectedRows) throw err(404, "Producto no encontrado");
        res.json({ message: "Producto actualizado" });
    } catch (e) {
        if (e.code === "ER_DUP_ENTRY") throw err(409, "Ya existe un producto con ese código");
        throw e;
    }
}));

// AJUSTE de inventario (conteo físico, merma, daño)  { cantidad: +/-, nota }
router.post("/productos/:id/ajuste", h(async (req, res) => {
    const delta = Number(req.body.cantidad);
    if (!delta) throw err(400, "Indique la cantidad a sumar (+) o restar (−)");
    if (!req.body.nota) throw err(400, "Indique el motivo del ajuste");
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const stock = await moverStock(conn, { id_producto: req.params.id, delta, tipo: "AJUSTE", nota: req.body.nota });
        await conn.commit();
        res.json({ message: "Ajuste registrado", stock });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
}));

// KARDEX de un producto
router.get("/productos/:id/kardex", h(async (req, res) => {
    const [rows] = await db.query(`
        SELECT id_mov, tipo, cantidad, costo_unit, stock_resultante, id_orden, id_compra, nota,
               DATE_FORMAT(fecha, '${FMT}') AS fecha
        FROM Movimiento_Inventario WHERE id_producto = ?
        ORDER BY id_mov DESC LIMIT 300`, [req.params.id]);
    res.json(rows);
}));

// ELIMINAR solo si nunca se movió; si tiene historial, se desactiva
router.delete("/productos/:id", h(async (req, res) => {
    const [[uso]] = await db.query(`
        SELECT (SELECT COUNT(*) FROM Movimiento_Inventario WHERE id_producto = ?)
             + (SELECT COUNT(*) FROM Servicio_Producto WHERE id_producto = ?)
             + (SELECT COUNT(*) FROM Compra_Detalle WHERE id_producto = ?) AS n`,
        [req.params.id, req.params.id, req.params.id]);
    if (uso.n > 0) {
        await db.query("UPDATE Producto SET activo = 0 WHERE id_producto = ?", [req.params.id]);
        return res.json({ message: "El producto tiene historial: se desactivó en lugar de eliminarse" });
    }
    await db.query("DELETE FROM Producto WHERE id_producto = ?", [req.params.id]);
    res.json({ message: "Producto eliminado" });
}));

module.exports = router;
