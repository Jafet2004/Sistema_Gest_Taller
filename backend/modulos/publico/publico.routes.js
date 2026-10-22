// =========================================================
// SITIO PÚBLICO PARA CLIENTES (sin inicio de sesión)
//   GET  /publico/servicios    → catálogo para mostrar en la página (sin precios)
//   POST /publico/seguimiento  → estado de una orden { orden, verificacion }
//
// Seguridad:
//   - El número de orden es consecutivo y fácil de adivinar, por eso se pide además
//     los ÚLTIMOS 4 DÍGITOS DEL CELULAR del cliente registrado en la orden.
//   - Respuesta genérica si no coincide (no revela si la orden existe).
//   - Máximo 10 consultas fallidas por IP cada 15 minutos.
//   - Solo se devuelve información necesaria: primer nombre, vehículo, servicios,
//     estado, fechas y saldo. Nada de apellidos, teléfonos, chasis ni fotos.
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db").promise();

const h = fn => (req, res, next) => fn(req, res, next).catch(next);
const FMT = "%Y-%m-%d %H:%i:%s";

// ---------- límite de intentos fallidos por IP ----------
const VENTANA_MS = 15 * 60 * 1000, MAX_FALLOS = 10;
const fallos = new Map();   // ip → { n, hasta }
function bloqueado(ip) {
    const f = fallos.get(ip);
    if (!f || f.hasta < Date.now()) { fallos.delete(ip); return false; }
    return f.n >= MAX_FALLOS;
}
function registrarFallo(ip) {
    const f = fallos.get(ip);
    if (!f || f.hasta < Date.now()) fallos.set(ip, { n: 1, hasta: Date.now() + VENTANA_MS });
    else f.n++;
}
setInterval(() => { const now = Date.now(); for (const [ip, f] of fallos) if (f.hasta < now) fallos.delete(ip); }, VENTANA_MS).unref();

// ---------- catálogo público ----------
router.get("/publico/servicios", h(async (req, res) => {
    const [rows] = await db.query(
        "SELECT id_trabajo, Name_trabajo AS nombre, Detalle_trab AS detalle FROM List_Trabajo ORDER BY Name_trabajo");
    res.json(rows);
}));

// ---------- seguimiento de una orden ----------
router.post("/publico/seguimiento", h(async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress;
    if (bloqueado(ip))
        return res.status(429).json({ message: "Demasiadas consultas. Intente de nuevo en unos minutos." });

    const orden = parseInt(String(req.body.orden || "").replace(/\D/g, ""), 10);
    const verif = String(req.body.verificacion || "").replace(/\D/g, "");
    if (!orden || verif.length !== 4)
        return res.status(400).json({ message: "Ingrese el número de orden y los últimos 4 dígitos de su celular." });

    const [[o]] = await db.query(`
        SELECT o.id_orden, o.estado, o.kilometraje,
               DATE_FORMAT(o.fecha_entrada, '${FMT}') AS fecha_entrada,
               DATE_FORMAT(o.fecha_salida,  '${FMT}') AS fecha_salida,
               c.pr_name AS nombre, c.celular,
               v.Marca, v.Modelo, v.Año AS anio,
               vt.total, vt.pagado
        FROM Orden_Servicio o
        JOIN Clientes c   ON c.id_client = o.id_client
        JOIN Vehiculos v  ON v.id_Vehic  = o.id_Vehic
        JOIN v_orden_total vt ON vt.id_orden = o.id_orden
        WHERE o.id_orden = ?`, [orden]);

    if (!o || String(o.celular).slice(-4) !== verif) {
        registrarFallo(ip);
        return res.status(404).json({ message: "No encontramos una orden con esos datos. Revise el número de orden y su celular." });
    }

    const [servicios] = await db.query(`
        SELECT t.Name_trabajo AS nombre, t.Detalle_trab AS detalle
        FROM Orden_Servicio_Detalle d JOIN List_Trabajo t ON t.id_trabajo = d.id_trabajo
        WHERE d.id_orden = ? ORDER BY d.id_detalle`, [orden]);

    const [historial] = await db.query(`
        SELECT estado, DATE_FORMAT(fecha, '${FMT}') AS fecha
        FROM Orden_Estado_Historial WHERE id_orden = ? ORDER BY fecha, id_hist`, [orden]);

    res.json({
        orden: o.id_orden,
        estado: o.estado,
        cliente: o.nombre,
        vehiculo: { marca: o.Marca, modelo: o.Modelo, anio: o.anio },
        kilometraje: o.kilometraje,
        fecha_entrada: o.fecha_entrada,
        fecha_salida: o.fecha_salida,
        servicios,
        historial,
        total: Number(o.total),
        pagado: Number(o.pagado),
        saldo: Math.round((Number(o.total) - Number(o.pagado)) * 100) / 100
    });
}));

module.exports = router;
