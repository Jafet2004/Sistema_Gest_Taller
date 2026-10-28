// =========================================================
// SITIO PÚBLICO PARA CLIENTES (sin inicio de sesión)
//   GET  /publico/servicios    → catálogo para mostrar en la página (sin precios)
//   (la consulta de órdenes está en portal.routes.js y requiere sesión del cliente)
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

// La consulta de órdenes ahora requiere que el cliente inicie sesión:
// ver modulos/publico/portal.routes.js  (POST /portal/orden)

module.exports = router;
