// =========================================================
// Taller → Reportes de vehículo (diagnóstico / trabajo realizado)
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// =========================================================
// REPORTES - CRUD COMPLETO
// =========================================================

// Obtener todos los reportes
router.get("/reportes", (req, res) => {
    const sql = `
        SELECT r.*,
               c.pr_name, c.pr_lastname,
               v.Marca, v.Modelo,
               t.Name_trabajo
        FROM Reporte_Vehiculo r
        JOIN Clientes c ON c.id_client = r.id_client
        JOIN Vehiculos v ON v.id_Vehic = r.id_Vehic
        JOIN List_Trabajo t ON t.id_trabajo = r.id_trabajo
        ORDER BY r.fecha_reporte DESC
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// Obtener un reporte por ID
router.get("/reportes/:id", (req, res) => {
    const { id } = req.params;

    const sql = `
        SELECT r.*,
               c.pr_name, c.pr_lastname,
               v.Marca, v.Modelo,
               t.Name_trabajo
        FROM Reporte_Vehiculo r
        JOIN Clientes c ON c.id_client = r.id_client
        JOIN Vehiculos v ON v.id_Vehic = r.id_Vehic
        JOIN List_Trabajo t ON t.id_trabajo = r.id_trabajo
        WHERE r.id_reporte = ?
    `;

    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.length === 0)
            return res.status(404).json({ message: "Reporte no encontrado" });

        res.json(results[0]);
    });
});


// Crear reporte
router.post("/reportes", (req, res) => {
    const { id_client, id_Vehic, id_trabajo, fecha_reporte, observaciones, recomendaciones } = req.body;

    const sql = `
        INSERT INTO Reporte_Vehiculo (id_client, id_Vehic, id_trabajo, fecha_reporte, observaciones, recomendaciones)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [id_client, id_Vehic, id_trabajo, fecha_reporte, observaciones, recomendaciones], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Reporte creado" });
    });
});

// Actualizar reporte
router.put("/reportes/:id", (req, res) => {
    const { id } = req.params;
    const { id_client, id_Vehic, id_trabajo, fecha_reporte, observaciones, recomendaciones } = req.body;

    const sql = `
        UPDATE Reporte_Vehiculo
        SET id_client=?, id_Vehic=?, id_trabajo=?, fecha_reporte=?, observaciones=?, recomendaciones=?
        WHERE id_reporte=?
    `;

    db.query(sql, [id_client, id_Vehic, id_trabajo, fecha_reporte, observaciones, recomendaciones, id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Reporte actualizado" });
    });
});

// Eliminar reporte
router.delete("/reportes/:id", (req, res) => {
    const { id } = req.params;

    const sql = `DELETE FROM Reporte_Vehiculo WHERE id_reporte=?`;

    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Reporte eliminado" });
    });
});

module.exports = router;
