// =========================================================
// Gestión de servicios → Catálogo de servicios (List_Trabajo)
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// =========================================================
// TRABAJOS / SERVICIOS
// =========================================================
// ===============================
// CALCULAR TOTAL (BACKEND)
// ===============================
function calcularTotal(data) {
    return (
        Number(data.Costo_Compra || 0) +
        Number(data.Costo_Existencia || 0) +
        Number(data.Costo_Mano_Obra || 0)
    );
}

// ===============================
// OBTENER SERVICIOS
// ===============================
router.get("/trabajos", (req, res) => {
    db.query("SELECT * FROM List_Trabajo", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// ===============================
// CREAR SERVICIO
// ===============================
router.post("/trabajos", (req, res) => {
    const {
        Name_trabajo,
        Detalle_trab,
        Compra_Externa,
        Costo_Compra,
        Usa_Existencia,
        Costo_Existencia,
        Mano_Obra,
        Costo_Mano_Obra
    } = req.body;

    if (!Name_trabajo || !Detalle_trab) {
        return res.status(400).json({ message: "Datos incompletos" });
    }

    const Total = calcularTotal({
        Costo_Compra,
        Costo_Existencia,
        Costo_Mano_Obra
    });

    const sql = `
        INSERT INTO List_Trabajo
        (Name_trabajo, Detalle_trab, Compra_Externa, Costo_Compra,
         Usa_Existencia, Costo_Existencia, Mano_Obra, Costo_Mano_Obra, Total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [
        Name_trabajo,
        Detalle_trab,
        Compra_Externa,
        Costo_Compra,
        Usa_Existencia,
        Costo_Existencia,
        Mano_Obra,
        Costo_Mano_Obra,
        Total
    ], (err, result) => {
        if (err) return res.status(500).json(err);

        res.json({
            message: "Servicio registrado correctamente",
            id_trabajo: result.insertId,   // para poder asignarle repuestos enseguida
            Total
        });
    });
});

// ===============================
// ACTUALIZAR SERVICIO
// ===============================
router.put("/trabajos/:id", (req, res) => {
    const { id } = req.params;

    const {
        Name_trabajo,
        Detalle_trab,
        Compra_Externa,
        Costo_Compra,
        Usa_Existencia,
        Costo_Existencia,
        Mano_Obra,
        Costo_Mano_Obra
    } = req.body;

    const Total = calcularTotal({
        Costo_Compra,
        Costo_Existencia,
        Costo_Mano_Obra
    });

    const sql = `
        UPDATE List_Trabajo SET
            Name_trabajo=?,
            Detalle_trab=?,
            Compra_Externa=?,
            Costo_Compra=?,
            Usa_Existencia=?,
            Costo_Existencia=?,
            Mano_Obra=?,
            Costo_Mano_Obra=?,
            Total=?
        WHERE id_trabajo=?
    `;

    db.query(sql, [
        Name_trabajo,
        Detalle_trab,
        Compra_Externa,
        Costo_Compra,
        Usa_Existencia,
        Costo_Existencia,
        Mano_Obra,
        Costo_Mano_Obra,
        Total,
        id
    ], (err, result) => {
        if (err) return res.status(500).json(err);
        if (result.affectedRows === 0)
            return res.status(404).json({ message: "Servicio no encontrado" });

        res.json({
            message: "Servicio actualizado correctamente",
            Total
        });
    });
});

// ===============================
// ELIMINAR SERVICIO
// ===============================
router.delete("/trabajos/:id", (req, res) => {
    db.query(
        "DELETE FROM List_Trabajo WHERE id_trabajo=?",
        [req.params.id],
        (err, result) => {
            if (err) {
                if (err.code === "ER_ROW_IS_REFERENCED_2")
                    return res.status(409).json({ message: "No se puede eliminar: el servicio ya se usó en órdenes, citas o reportes" });
                return res.status(500).json(err);
            }
            if (result.affectedRows === 0)
                return res.status(404).json({ message: "Servicio no encontrado" });

            res.json({ message: "Servicio eliminado correctamente" });
        }
    );
});

// =========================================================
// RECETA: repuestos que consume cada servicio del catálogo
// (al crear una orden con este servicio, se copian a la orden y se
//  descuentan del inventario cuando el trabajo inicia)
// =========================================================
const dbp = db.promise();

router.get("/trabajos/:id/repuestos", async (req, res, next) => {
    try {
        const [rows] = await dbp.query(`
            SELECT sp.id_producto, sp.cantidad, p.codigo, p.nombre, p.unidad, p.stock,
                   p.costo_promedio, p.precio_venta,
                   ROUND(sp.cantidad * p.precio_venta, 2) AS subtotal_venta,
                   ROUND(sp.cantidad * p.costo_promedio, 2) AS subtotal_costo
            FROM Servicio_Producto sp
            JOIN Producto p ON p.id_producto = sp.id_producto
            WHERE sp.id_trabajo = ?
            ORDER BY p.nombre`, [req.params.id]);
        res.json(rows);
    } catch (e) { next(e); }
});

// Reemplaza la receta completa  { items: [{ id_producto, cantidad }] }
router.put("/trabajos/:id/repuestos", async (req, res, next) => {
    const items = (req.body.items || []).filter(i => i.id_producto && Number(i.cantidad) > 0);
    const ids = items.map(i => Number(i.id_producto));
    if (new Set(ids).size !== ids.length)
        return res.status(400).json({ message: "Hay un repuesto repetido en la receta" });

    const conn = await dbp.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query("DELETE FROM Servicio_Producto WHERE id_trabajo = ?", [req.params.id]);
        if (items.length) {
            await conn.query("INSERT INTO Servicio_Producto (id_trabajo, id_producto, cantidad) VALUES ?",
                [items.map(i => [req.params.id, i.id_producto, Number(i.cantidad)])]);
        }
        await conn.commit();
        res.json({ message: `Receta guardada: ${items.length} repuesto(s)` });
    } catch (e) { await conn.rollback(); next(e); }
    finally { conn.release(); }
});

module.exports = router;
