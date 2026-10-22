// =========================================================
// Gestión de cliente → Vehículos
// El vehículo es un dato FIJO del cliente (marca, modelo, año, chasis).
// Que entre al taller ya NO se guarda aquí: eso es una Orden de servicio
// (ver modulos/gestion_servicios/ordenes.routes.js).
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db").promise();

const h = fn => (req, res, next) => fn(req, res, next).catch(next);
const err = (status, message) => Object.assign(new Error(message), { status });

function validar({ Marca, Modelo, Año, Numero_chasis, id_client }) {
    if (!id_client) throw err(400, "Seleccione el cliente dueño del vehículo");
    if (!Marca || !Modelo || !Numero_chasis) throw err(400, "Marca, modelo y chasis son obligatorios");
    if (Numero_chasis.length > 16) throw err(400, "El chasis no puede exceder 16 caracteres");
    if (Año && !/^\d{4}$/.test(Año)) throw err(400, "El año debe tener 4 dígitos");
}

async function chasisRepetido(chasis, exceptoId = 0) {
    const [r] = await db.query(
        "SELECT id_Vehic FROM Vehiculos WHERE Numero_chasis = ? AND id_Vehic <> ?",
        [chasis.trim(), exceptoId]
    );
    return r.length > 0;
}

// ---------------------------------------------------------
// LISTA de vehículos
// Incluye datos de la ÚLTIMA orden con los nombres de columna antiguos
// (Entrada, Salida, Name_trabajo...) para que reportes y dashboard sigan funcionando.
// ---------------------------------------------------------
const SELECT_VEHICULO = `
    SELECT v.id_Vehic, v.Marca, v.Modelo, v.Año, v.Numero_chasis, v.id_client,
           c.pr_name, c.sc_name, c.pr_lastname, c.sc_lastname,
           o.id_orden, o.estado AS estado_orden,
           o.fecha_entrada AS Entrada, o.fecha_salida AS Salida,
           (SELECT GROUP_CONCAT(t.Name_trabajo SEPARATOR ', ')
              FROM Orden_Servicio_Detalle d JOIN List_Trabajo t ON t.id_trabajo = d.id_trabajo
             WHERE d.id_orden = o.id_orden) AS Name_trabajo,
           tr.pr_name AS trab_pr_name, tr.pr_lastname AS trab_pr_lastname
    FROM Vehiculos v
    JOIN Clientes c ON c.id_client = v.id_client
    LEFT JOIN Orden_Servicio o ON o.id_orden = (
        SELECT MAX(id_orden) FROM Orden_Servicio WHERE id_Vehic = v.id_Vehic
    )
    LEFT JOIN Trabajador tr ON tr.id_trab = o.id_trab
`;

router.get("/vehiculos", h(async (req, res) => {
    const [rows] = await db.query(SELECT_VEHICULO + " ORDER BY v.id_Vehic DESC");
    res.json(rows);
}));

router.get("/vehiculos/:id", h(async (req, res) => {
    const [rows] = await db.query(SELECT_VEHICULO + " WHERE v.id_Vehic = ?", [req.params.id]);
    if (!rows.length) throw err(404, "Vehículo no encontrado");
    res.json(rows[0]);
}));

// Historial de visitas al taller de un vehículo
router.get("/vehiculos/:id/historial", h(async (req, res) => {
    const [rows] = await db.query(`
        SELECT o.id_orden, o.estado, o.fecha_entrada, o.fecha_salida, o.kilometraje, o.observaciones,
               (SELECT GROUP_CONCAT(t.Name_trabajo SEPARATOR ', ')
                  FROM Orden_Servicio_Detalle d JOIN List_Trabajo t ON t.id_trabajo = d.id_trabajo
                 WHERE d.id_orden = o.id_orden) AS servicios,
               vt.total
        FROM Orden_Servicio o
        JOIN v_orden_total vt ON vt.id_orden = o.id_orden
        WHERE o.id_Vehic = ?
        ORDER BY o.id_orden DESC`, [req.params.id]);
    res.json(rows);
}));

// ---------------------------------------------------------
// REGISTRAR vehículo (NO entra al taller, solo queda a nombre del cliente)
// POST /vehiculos { id_client, Marca, Modelo, Año, Numero_chasis }
// ---------------------------------------------------------
router.post("/vehiculos", h(async (req, res) => {
    const data = req.body;
    validar(data);
    if (await chasisRepetido(data.Numero_chasis))
        throw err(409, "Ya existe un vehículo con ese número de chasis");

    const [r] = await db.query(
        `INSERT INTO Vehiculos (Marca, Modelo, Año, Numero_chasis, id_client)
         VALUES (?, ?, ?, ?, ?)`,
        [data.Marca.trim(), data.Modelo.trim(), data.Año || "", data.Numero_chasis.trim(), data.id_client]
    );
    res.json({ message: "Vehículo registrado", id_Vehic: r.insertId });
}));

// ---------------------------------------------------------
// EDITAR vehículo
// ---------------------------------------------------------
router.put("/vehiculos/:id", h(async (req, res) => {
    const data = req.body;
    validar(data);
    if (await chasisRepetido(data.Numero_chasis, req.params.id))
        throw err(409, "Ya existe otro vehículo con ese número de chasis");

    const [r] = await db.query(
        `UPDATE Vehiculos SET Marca=?, Modelo=?, Año=?, Numero_chasis=?, id_client=?
         WHERE id_Vehic=?`,
        [data.Marca.trim(), data.Modelo.trim(), data.Año || "", data.Numero_chasis.trim(),
         data.id_client, req.params.id]
    );
    if (!r.affectedRows) throw err(404, "Vehículo no encontrado");
    res.json({ message: "Vehículo actualizado" });
}));

// ---------------------------------------------------------
// ELIMINAR vehículo (solo si nunca ha tenido órdenes ni reportes)
// ---------------------------------------------------------
router.delete("/vehiculos/:id", h(async (req, res) => {
    const [[uso]] = await db.query(`
        SELECT (SELECT COUNT(*) FROM Orden_Servicio   WHERE id_Vehic = ?) AS ordenes,
               (SELECT COUNT(*) FROM Reporte_Vehiculo WHERE id_Vehic = ?) AS reportes`,
        [req.params.id, req.params.id]);
    if (uso.ordenes || uso.reportes)
        throw err(409, "No se puede eliminar: el vehículo tiene historial en el taller");

    const [r] = await db.query("DELETE FROM Vehiculos WHERE id_Vehic = ?", [req.params.id]);
    if (!r.affectedRows) throw err(404, "Vehículo no encontrado");
    res.json({ message: "Vehículo eliminado" });
}));

module.exports = router;
