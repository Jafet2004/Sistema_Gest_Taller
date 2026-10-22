// =========================================================
// Administración → Dashboard / estadísticas
// Basado en Órdenes de servicio (entradas al taller) y Caja (ingresos reales).
// Devuelve los mismos campos que antes, así dash.js no cambia.
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db").promise();

const h = fn => (req, res, next) => fn(req, res, next).catch(next);
const uno = async (sql, p = []) => (await db.query(sql, p))[0][0];
const varios = async (sql, p = []) => (await db.query(sql, p))[0];

// 1. ESTADÍSTICAS GENERALES
router.get("/dashboard/estadisticas", h(async (req, res) => {
    const [
        clientes, enTaller, totalVeh, trabajadores, inventario,
        ordenes30, porCliente, marcas, topClientes, semanas, bajoMinimo
    ] = await Promise.all([
        uno("SELECT COUNT(*) AS total FROM Clientes"),
        uno(`SELECT COUNT(*) AS total FROM Orden_Servicio
             WHERE estado IN ('RECIBIDO','EN_PROCESO','TERMINADO')`),
        uno("SELECT COUNT(*) AS total FROM Vehiculos"),
        uno("SELECT COUNT(*) AS total FROM Trabajador"),
        uno("SELECT COALESCE(SUM(cantidad),0) AS total FROM Inventario"),
        uno(`SELECT COUNT(*) AS total FROM Orden_Servicio
             WHERE fecha_entrada >= DATE_SUB(NOW(), INTERVAL 30 DAY)`),
        uno(`SELECT COUNT(DISTINCT id_client) AS clientes, COUNT(*) AS vehiculos FROM Vehiculos`),
        varios(`SELECT Marca, COUNT(*) AS cantidad FROM Vehiculos
                GROUP BY Marca ORDER BY cantidad DESC LIMIT 6`),
        varios(`SELECT c.id_client, CONCAT(c.pr_name, ' ', c.pr_lastname) AS nombre,
                       COUNT(o.id_orden) AS total_vehiculos           -- visitas al taller
                FROM Clientes c
                LEFT JOIN Orden_Servicio o ON o.id_client = c.id_client
                GROUP BY c.id_client, c.pr_name, c.pr_lastname
                ORDER BY total_vehiculos DESC LIMIT 5`),
        varios(`SELECT YEARWEEK(fecha_entrada) AS semana, COUNT(*) AS cantidad
                FROM Orden_Servicio
                WHERE fecha_entrada >= DATE_SUB(NOW(), INTERVAL 4 WEEK)
                GROUP BY YEARWEEK(fecha_entrada)
                ORDER BY semana ASC`),
        uno("SELECT COUNT(*) AS total FROM Producto WHERE activo = 1 AND stock <= stock_minimo")
    ]);

    res.json({
        totalClientes: clientes.total,
        vehiculosEnTaller: enTaller.total,
        totalVehiculos: totalVeh.total,
        totalTrabajadores: trabajadores.total,
        totalInventario: Number(inventario.total),
        vehiculosPorSemana: (ordenes30.total / 4.3).toFixed(1),
        vehiculosPorCliente: porCliente.clientes ? (porCliente.vehiculos / porCliente.clientes).toFixed(1) : 0,
        distribucionMarcas: marcas,
        topClientes,
        vehiculosUltimasSemanas: semanas,
        productosBajoMinimo: bajoMinimo.total
    });
}));

// 2. ÚLTIMAS ENTRADAS AL TALLER (10)
router.get("/dashboard/vehiculos-recientes", h(async (req, res) => {
    res.json(await varios(`
        SELECT o.id_orden, v.Marca, v.Modelo, v.Año,
               o.fecha_entrada AS Entrada, o.fecha_salida AS Salida, o.estado,
               CONCAT(c.pr_name, ' ', c.pr_lastname) AS cliente_nombre
        FROM Orden_Servicio o
        JOIN Vehiculos v ON v.id_Vehic  = o.id_Vehic
        JOIN Clientes  c ON c.id_client = o.id_client
        ORDER BY o.fecha_entrada DESC
        LIMIT 10`));
}));

// 3. RESUMEN DEL DÍA (ingresos = pagos reales registrados en Caja)
router.get("/dashboard/resumen-dia", h(async (req, res) => {
    res.json(await uno(`
        SELECT
          (SELECT COUNT(*) FROM Orden_Servicio WHERE DATE(fecha_entrada) = CURDATE()) AS vehiculos_hoy,
          (SELECT COUNT(*) FROM Orden_Servicio
            WHERE estado IN ('RECIBIDO','EN_PROCESO','TERMINADO'))                   AS vehiculos_en_taller,
          (SELECT COUNT(*) FROM Agenda WHERE DATE(fecha_hora) = CURDATE())          AS citas_hoy,
          (SELECT COALESCE(SUM(monto),0) FROM Caja_Movimiento
            WHERE tipo = 'INGRESO' AND DATE(fecha) = CURDATE())                     AS ingresos_hoy`));
}));

module.exports = router;
