// =========================================================
// Administración → Trabajadores
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// =========================================================
// TRABAJADORES
// =========================================================
router.get("/trabajadores", (req, res) => {
    db.query("SELECT * FROM Trabajador", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

router.post("/trabajadores", (req, res) => {
    const { pr_name, sc_name, pr_lastname, sc_lastname, celular, puesto, especialidad } = req.body;

    const sql = `
        INSERT INTO Trabajador (pr_name, sc_name, pr_lastname, sc_lastname, celular, puesto, especialidad)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    db.query(sql, [pr_name, sc_name, pr_lastname, sc_lastname, celular, puesto || null, especialidad || null], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Trabajador creado" });
    });
});
// Actualizar trabajador
router.put("/trabajadores/:id", (req, res) => {
    const { id } = req.params;
    const { pr_name, sc_name, pr_lastname, sc_lastname, celular, puesto, especialidad } = req.body;

    const sql = `
        UPDATE Trabajador
        SET pr_name=?, sc_name=?, pr_lastname=?, sc_lastname=?, celular=?, puesto=?, especialidad=?
        WHERE id_trab=?
    `;

    db.query(sql, [pr_name, sc_name, pr_lastname, sc_lastname, celular, puesto || null, especialidad || null, id], (err) => {
        if (err) return res.status(500).json(err);

        res.json({ message: "Trabajador actualizado" });
    });
});

// Eliminar trabajador
router.delete("/trabajadores/:id", (req, res) => {
    const { id } = req.params;

    const sql = "DELETE FROM Trabajador WHERE id_trab=?";

    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json(err);

        res.json({ message: "Trabajador eliminado" });
    });
});

module.exports = router;
