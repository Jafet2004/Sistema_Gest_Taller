// =========================================================
// Gestión de servicios → Agenda / citas (solicitud de servicio) + notificaciones
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// =========================================================
// AGENDA / CITAS
// =========================================================
// OBTENER TODAS LAS CITAS
router.get("/agenda", (req, res) => {
    const sql = `
        SELECT 
            a.*,
            CONCAT(c.pr_name, ' ', c.pr_lastname) AS cliente,
            t.Name_trabajo AS trabajo
        FROM Agenda a
        JOIN Clientes c ON c.id_client = a.id_client
        JOIN List_Trabajo t ON t.id_trabajo = a.id_trabajo
        ORDER BY fecha_hora ASC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// OBTENER UNA CITA POR ID
router.get("/agenda/:id", (req, res) => {
    const sql = "SELECT * FROM Agenda WHERE id_cita = ?";
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results[0]);
    });
});

// CREAR CITA
router.post("/agenda", (req, res) => {
    const { id_client, id_trabajo, descripcion, fecha_hora } = req.body;

    const sql = `
        INSERT INTO Agenda (id_client, id_trabajo, descripcion, fecha_hora)
        VALUES (?, ?, ?, ?)
    `;
    db.query(sql, [id_client, id_trabajo, descripcion, fecha_hora], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Cita registrada" });
    });
});

// ACTUALIZAR CITA
router.put("/agenda/:id", (req, res) => {
    const { id_client, id_trabajo, descripcion, fecha_hora } = req.body;

    const sql = `
        UPDATE Agenda 
        SET id_client=?, id_trabajo=?, descripcion=?, fecha_hora=?
        WHERE id_cita=?
    `;
    db.query(sql, [id_client, id_trabajo, descripcion, fecha_hora, req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Cita actualizada correctamente" });
    });
});

// ELIMINAR CITA
router.delete("/agenda/:id", (req, res) => {
    const sql = "DELETE FROM Agenda WHERE id_cita = ?";
    db.query(sql, [req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Cita eliminada correctamente" });
    });
});

// =========================================================
// NOTIFICACIONES: Citas próximas en 7 días
// =========================================================
router.get("/notificaciones/citas-proximas", (req, res) => {
    const sql = `
        SELECT a.*, c.pr_name, c.sc_name, c.pr_lastname, c.sc_lastname, t.Name_trabajo
        FROM Agenda a
        JOIN Clientes c ON a.id_client = c.id_client
        JOIN List_Trabajo t ON a.id_trabajo = t.id_trabajo
        WHERE a.fecha_hora BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
        ORDER BY a.fecha_hora ASC
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

module.exports = router;
