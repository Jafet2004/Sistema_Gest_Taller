// =========================================================
// Gestión de compras → Proveedores
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db").promise();

const h = fn => (req, res, next) => fn(req, res, next).catch(next);
const err = (status, message) => Object.assign(new Error(message), { status });

router.get("/proveedores", h(async (req, res) => {
    const [rows] = await db.query(`
        SELECT pr.*,
               (SELECT COUNT(*) FROM Producto p WHERE p.id_proveedor = pr.id_proveedor AND p.activo = 1) AS productos,
               (SELECT COUNT(*) FROM Compra c WHERE c.id_proveedor = pr.id_proveedor) AS compras
        FROM Proveedor pr
        ${req.query.todos === "1" ? "" : "WHERE pr.activo = 1"}
        ORDER BY pr.nombre`);
    res.json(rows);
}));

function datos(b) {
    if (!b.nombre || !b.nombre.trim()) throw err(400, "El nombre del proveedor es obligatorio");
    return [b.nombre.trim(), b.contacto || null, b.telefono || null, b.email || null, b.direccion || null];
}

router.post("/proveedores", h(async (req, res) => {
    const [r] = await db.query(
        "INSERT INTO Proveedor (nombre, contacto, telefono, email, direccion) VALUES (?, ?, ?, ?, ?)",
        datos(req.body));
    res.json({ message: "Proveedor registrado", id_proveedor: r.insertId });
}));

router.put("/proveedores/:id", h(async (req, res) => {
    const [r] = await db.query(
        "UPDATE Proveedor SET nombre=?, contacto=?, telefono=?, email=?, direccion=? WHERE id_proveedor=?",
        [...datos(req.body), req.params.id]);
    if (!r.affectedRows) throw err(404, "Proveedor no encontrado");
    res.json({ message: "Proveedor actualizado" });
}));

// Con compras registradas no se borra: se desactiva (conserva el historial)
router.delete("/proveedores/:id", h(async (req, res) => {
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM Compra WHERE id_proveedor = ?", [req.params.id]);
    if (n > 0) {
        await db.query("UPDATE Proveedor SET activo = 0 WHERE id_proveedor = ?", [req.params.id]);
        return res.json({ message: "El proveedor tiene compras: se desactivó en lugar de eliminarse" });
    }
    await db.query("DELETE FROM Proveedor WHERE id_proveedor = ?", [req.params.id]);
    res.json({ message: "Proveedor eliminado" });
}));

module.exports = router;
