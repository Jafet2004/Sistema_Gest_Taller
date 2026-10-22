// =========================================================
// Gestión de cliente → Clientes
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db");

// =========================================================
// CLIENTES (CRUD)
// =========================================================
router.get("/clientes", (req, res) => {
    db.query("SELECT * FROM Clientes", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

router.post("/clientes", (req, res) => {
    const { pr_name, sc_name, pr_lastname, sc_lastname, celular } = req.body;

    const sql = `
        INSERT INTO Clientes (pr_name, sc_name, pr_lastname, sc_lastname, celular)
        VALUES (?, ?, ?, ?, ?)
    `;
    db.query(sql, [pr_name, sc_name, pr_lastname, sc_lastname, celular], (err, result) => {
        if (err) {
            if (err.code === "ER_CHECK_CONSTRAINT_VIOLATED")
                return res.status(400).json({ message: "Celular inválido: 8 dígitos y debe iniciar con 5, 7 u 8" });
            return res.status(500).json({ message: "Error al crear cliente", error: err.message });
        }
        // Devolvemos el id para poder seleccionarlo de inmediato (flujo de registro de vehículo)
        res.json({ message: "Cliente creado", id_client: result.insertId });
    });
});

// =========================================================
// BUSCAR cliente (nombre, apellido o celular)
// GET /clientes/buscar?q=juan
// =========================================================
router.get("/clientes/buscar", (req, res) => {
    const q = `%${(req.query.q || "").trim()}%`;
    const sql = `
        SELECT c.*,
               (SELECT COUNT(*) FROM Vehiculos v WHERE v.id_client = c.id_client) AS total_vehiculos
        FROM Clientes c
        WHERE CONCAT_WS(' ', c.pr_name, c.sc_name, c.pr_lastname, c.sc_lastname) LIKE ?
           OR CONCAT_WS(' ', c.pr_name, c.pr_lastname) LIKE ?
           OR c.celular LIKE ?
        ORDER BY c.pr_name, c.pr_lastname
        LIMIT 20
    `;
    db.query(sql, [q, q, q], (err, results) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(results);
    });
});

// =========================================================
// VEHÍCULOS DE UN CLIENTE (con su estado: en taller o disponible)
// GET /clientes/:id/vehiculos
// =========================================================
router.get("/clientes/:id/vehiculos", (req, res) => {
    const sql = `
        SELECT v.id_Vehic, v.Marca, v.Modelo, v.Año, v.Numero_chasis,
               o.id_orden AS orden_activa, o.estado AS estado_orden,
               (SELECT COUNT(*) FROM Orden_Servicio x WHERE x.id_Vehic = v.id_Vehic) AS visitas
        FROM Vehiculos v
        LEFT JOIN Orden_Servicio o
               ON o.id_Vehic = v.id_Vehic
              AND o.estado IN ('RECIBIDO','EN_PROCESO','TERMINADO')
        WHERE v.id_client = ?
        ORDER BY v.id_Vehic DESC
    `;
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(results);
    });
});

// ELIMINAR cliente
router.delete("/clientes/:id", (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM Clientes WHERE id_client = ?";
    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json({ error: "Error al eliminar cliente", details: err });
        if (results.affectedRows === 0) return res.status(404).json({ message: "Cliente no encontrado" });
        res.json({ message: "Cliente eliminado" });
    });
});

// ACTUALIZAR cliente
router.put("/clientes/:id", (req, res) => {
    const { id } = req.params;
    const { pr_name, sc_name, pr_lastname, sc_lastname, celular } = req.body;

    if (!pr_name || !sc_name || !pr_lastname || !sc_lastname || !celular) {
        return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    const sql = `
        UPDATE Clientes
        SET pr_name = ?, sc_name = ?, pr_lastname = ?, sc_lastname = ?, celular = ?
        WHERE id_client = ?
    `;
    db.query(sql, [pr_name, sc_name, pr_lastname, sc_lastname, celular, id], (err, results) => {
        if (err) return res.status(500).json({ error: "Error al actualizar cliente", details: err });
        if (results.affectedRows === 0) return res.status(404).json({ message: "Cliente no encontrado" });
        res.json({ message: "Cliente actualizado" });
    });
});

module.exports = router;
