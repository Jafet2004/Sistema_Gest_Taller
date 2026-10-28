// =========================================================
// Utilidades compartidas: datos del cliente y detalle de una orden para el cliente
// =========================================================
const db = require("../../config/db").promise();
const FMT = "%Y-%m-%d %H:%i:%s";

/** "0010101900001a" o "001-010190-0001A" → "001-010190-0001A" (null si no es válida) */
function normalizarCedula(valor) {
    const s = String(valor || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (!/^\d{13}[A-Z]$/.test(s)) return null;
    return `${s.slice(0, 3)}-${s.slice(3, 9)}-${s.slice(9)}`;
}

function normalizarCorreo(valor) {
    const s = String(valor || "").trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 100 ? s : null;
}

/** Lo que el cliente puede ver de su orden: sin apellidos, teléfonos, chasis ni fotos */
async function detalleOrdenCliente(id_orden, id_client) {
    const [[o]] = await db.query(`
        SELECT o.id_orden, o.estado, o.kilometraje,
               DATE_FORMAT(o.fecha_entrada, '${FMT}') AS fecha_entrada,
               DATE_FORMAT(o.fecha_salida,  '${FMT}') AS fecha_salida,
               c.pr_name AS nombre, v.Marca, v.Modelo, v.Año AS anio,
               vt.total, vt.pagado
        FROM Orden_Servicio o
        JOIN Clientes c   ON c.id_client = o.id_client
        JOIN Vehiculos v  ON v.id_Vehic  = o.id_Vehic
        JOIN v_orden_total vt ON vt.id_orden = o.id_orden
        WHERE o.id_orden = ? AND o.id_client = ?`, [id_orden, id_client]);
    if (!o) return null;

    const [servicios] = await db.query(`
        SELECT t.Name_trabajo AS nombre, t.Detalle_trab AS detalle
        FROM Orden_Servicio_Detalle d JOIN List_Trabajo t ON t.id_trabajo = d.id_trabajo
        WHERE d.id_orden = ? ORDER BY d.id_detalle`, [id_orden]);
    const [historial] = await db.query(`
        SELECT estado, DATE_FORMAT(fecha, '${FMT}') AS fecha
        FROM Orden_Estado_Historial WHERE id_orden = ? ORDER BY fecha, id_hist`, [id_orden]);

    return {
        orden: o.id_orden, estado: o.estado, cliente: o.nombre,
        vehiculo: { marca: o.Marca, modelo: o.Modelo, anio: o.anio },
        kilometraje: o.kilometraje, fecha_entrada: o.fecha_entrada, fecha_salida: o.fecha_salida,
        servicios, historial,
        total: Number(o.total), pagado: Number(o.pagado),
        saldo: Math.round((Number(o.total) - Number(o.pagado)) * 100) / 100
    };
}

module.exports = { normalizarCedula, normalizarCorreo, detalleOrdenCliente };
