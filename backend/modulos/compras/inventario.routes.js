// =========================================================
// Gestión de compras → Inventario
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// =========================================================
// INVENTARIO
// =========================================================
router.get("/inventario", (req, res) => {
    db.query("SELECT * FROM Inventario", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

router.post("/inventario", (req, res) => {
    const { name_tool, marca, cantidad } = req.body;

    const sql = `
        INSERT INTO Inventario (name_tool, marca, cantidad)
        VALUES (?, ?, ?)
    `;
    db.query(sql, [name_tool, marca, cantidad], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Herramienta registrada" });
    });
});
// =========================
// ELIMINAR INVENTARIO
// =========================
router.delete("/inventario/:id", (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM Inventario WHERE id_invt = ?";
    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.affectedRows === 0)
            return res.status(404).json({ message: "Herramienta no encontrada" });
        res.json({ message: "Herramienta eliminada" });
    });
});

// =========================
// ACTUALIZAR INVENTARIO
// =========================
router.put("/inventario/:id", (req, res) => {
    const { id } = req.params;
    const { name_tool, marca, cantidad } = req.body;

    const sql = `
        UPDATE Inventario
        SET name_tool = ?, marca = ?, cantidad = ?
        WHERE id_invt = ?
    `;
    db.query(sql, [name_tool, marca, cantidad, id], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.affectedRows === 0)
            return res.status(404).json({ message: "Herramienta no encontrada" });
        res.json({ message: "Herramienta actualizada" });
    });
});

module.exports = router;
