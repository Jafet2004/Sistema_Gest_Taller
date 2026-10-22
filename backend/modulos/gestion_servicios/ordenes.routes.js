// =========================================================
// Gestión de servicios → Órdenes de servicio
// Una orden = el vehículo ENTRA al taller para uno o varios servicios.
//
// Estados:  RECIBIDO → EN_PROCESO → TERMINADO → ENTREGADO
//                  └──────────── CANCELADO
//
// Repuestos (inventario):
//   - Al agregar un servicio se copian los repuestos de su RECETA (incluidos en el precio).
//   - Se pueden agregar repuestos ADICIONALES (se cobran aparte).
//   - Se DESCUENTAN del stock al pasar a EN_PROCESO (si falta stock, no deja iniciar).
//   - Se DEVUELVEN a bodega si la orden vuelve a RECIBIDO o se CANCELA.
// =========================================================
const express = require("express");
const router = express.Router();
const db = require("../../config/db").promise();
const stock = require("../compras/stock");
const { puede, exigir } = require("../auth/seguridad");

const h = fn => (req, res, next) => fn(req, res, next).catch(next);
const err = (status, message, data) => Object.assign(new Error(message), { status, data });
const r2 = n => Math.round(Number(n || 0) * 100) / 100;

const ACTIVOS = ["RECIBIDO", "EN_PROCESO", "TERMINADO"];
const FMT = "%Y-%m-%d %H:%i:%s";

// Transiciones permitidas (no se puede "regresar" una orden entregada, etc.)
const SIGUIENTE = {
    RECIBIDO:   ["EN_PROCESO", "CANCELADO"],
    EN_PROCESO: ["TERMINADO", "RECIBIDO", "CANCELADO"],
    TERMINADO:  ["EN_PROCESO"],           // ENTREGADO se hace con /salida
    ENTREGADO:  [],
    CANCELADO:  []
};

// Total y pagado salen de la vista v_orden_total (servicios + repuestos cobrados; pagos de Caja)
const SELECT_ORDEN = `
    SELECT o.id_orden, o.id_Vehic, o.id_client, o.estado, o.kilometraje, o.observaciones, o.id_trab,
           DATE_FORMAT(o.fecha_entrada, '${FMT}') AS fecha_entrada,
           DATE_FORMAT(o.fecha_salida,  '${FMT}') AS fecha_salida,
           v.Marca, v.Modelo, v.Año, v.Numero_chasis,
           CONCAT(c.pr_name, ' ', c.pr_lastname) AS cliente, c.celular,
           CONCAT(tr.pr_name, ' ', tr.pr_lastname) AS trabajador_entrega,
           (SELECT GROUP_CONCAT(t.Name_trabajo SEPARATOR ', ')
              FROM Orden_Servicio_Detalle d JOIN List_Trabajo t ON t.id_trabajo = d.id_trabajo
             WHERE d.id_orden = o.id_orden) AS servicios,
           vt.total_servicios, vt.total_repuestos, vt.total, vt.pagado
    FROM Orden_Servicio o
    JOIN v_orden_total vt ON vt.id_orden = o.id_orden
    JOIN Vehiculos v ON v.id_Vehic  = o.id_Vehic
    JOIN Clientes  c ON c.id_client = o.id_client
    LEFT JOIN Trabajador tr ON tr.id_trab = o.id_trab
`;

async function obtenerOrden(id, conn = db) {
    const [[o]] = await conn.query(SELECT_ORDEN + " WHERE o.id_orden = ?", [id]);
    if (!o) throw err(404, "Orden no encontrada");
    return o;
}

function fotosJSON(f) {
    if (!f) return null;
    return typeof f === "string" ? f : JSON.stringify(f);
}

// El técnico (sin "ordenes.ver_todas") solo trabaja órdenes donde está asignado
function filtroPropias(req) {
    if (puede(req.usuario, "ordenes.ver_todas")) return { sql: "", params: [] };
    if (!req.usuario.id_trab) throw err(403, "Su usuario no está vinculado a un trabajador. Pida al Gerente que lo vincule.");
    return {
        sql: " AND EXISTS (SELECT 1 FROM Orden_Servicio_Detalle dx WHERE dx.id_orden = o.id_orden AND dx.id_trab = ?)",
        params: [req.usuario.id_trab]
    };
}
async function verificarPropia(req, id_orden) {
    const f = filtroPropias(req);
    if (!f.sql) return;
    const [[x]] = await db.query(`SELECT o.id_orden FROM Orden_Servicio o WHERE o.id_orden = ?${f.sql}`, [id_orden, ...f.params]);
    if (!x) throw err(403, "Esta orden no está asignada a usted");
}

// Deja constancia de cada cambio de estado (lo ve el cliente en el sitio de seguimiento)
async function registrarEstado(conn, id_orden, estado, req) {
    await conn.query("INSERT INTO Orden_Estado_Historial (id_orden, estado, id_user) VALUES (?, ?, ?)",
        [id_orden, estado, req.usuario ? req.usuario.id_user : null]);
}

// Ejecuta fn dentro de una transacción
async function enTransaccion(fn) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const r = await fn(conn);
        await conn.commit();
        return r;
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

// Bloquea la orden y verifica que admita cambios
async function ordenEditable(conn, id) {
    const [[o]] = await conn.query("SELECT id_orden, estado FROM Orden_Servicio WHERE id_orden = ? FOR UPDATE", [id]);
    if (!o) throw err(404, "Orden no encontrada");
    if (!ACTIVOS.includes(o.estado)) throw err(400, `La orden está ${o.estado}; ya no se puede modificar`);
    return o;
}

// =========================================================
// LISTAR
// GET /ordenes?estado=activas | RECIBIDO | ENTREGADO | todas
// =========================================================
router.get("/ordenes", h(async (req, res) => {
    const estado = req.query.estado || "activas";
    let where = "", params = [];
    if (estado === "activas") {
        where = "WHERE o.estado IN (?)"; params = [ACTIVOS];
    } else if (estado !== "todas") {
        where = "WHERE o.estado = ?"; params = [estado];
    }
    const f = filtroPropias(req);
    if (f.sql) where = (where || "WHERE 1=1") + f.sql;
    const [rows] = await db.query(
        `${SELECT_ORDEN} ${where} ORDER BY o.id_orden DESC LIMIT 200`, [...params, ...f.params]);
    res.json(rows);
}));

// =========================================================
// DETALLE (servicios, repuestos y fotos)
// =========================================================
router.get("/ordenes/:id", h(async (req, res) => {
    await verificarPropia(req, req.params.id);
    const orden = await obtenerOrden(req.params.id);
    const [detalle] = await db.query(`
        SELECT d.id_detalle, d.id_trabajo, d.precio, d.id_trab, t.Name_trabajo, t.Detalle_trab,
               CONCAT(tr.pr_name, ' ', tr.pr_lastname) AS mecanico
        FROM Orden_Servicio_Detalle d
        JOIN List_Trabajo t ON t.id_trabajo = d.id_trabajo
        LEFT JOIN Trabajador tr ON tr.id_trab = d.id_trab
        WHERE d.id_orden = ?
        ORDER BY d.id_detalle`, [req.params.id]);
    const [repuestos] = await db.query(`
        SELECT r.id_rep, r.id_detalle, r.id_producto, r.cantidad, r.precio_unit, r.costo_unit,
               r.cobrar, r.descontado, p.codigo, p.nombre, p.unidad, p.stock, t.Name_trabajo AS servicio
        FROM Orden_Servicio_Repuesto r
        JOIN Producto p ON p.id_producto = r.id_producto
        LEFT JOIN Orden_Servicio_Detalle d ON d.id_detalle = r.id_detalle
        LEFT JOIN List_Trabajo t ON t.id_trabajo = d.id_trabajo
        WHERE r.id_orden = ?
        ORDER BY r.cobrar, r.id_rep`, [req.params.id]);
    const [[fotos]] = await db.query(
        "SELECT foto_int, foto_out FROM Orden_Servicio WHERE id_orden = ?", [req.params.id]);
    const parse = s => { try { return s ? JSON.parse(s) : []; } catch { return [s]; } };
    res.json({ ...orden, detalle, repuestos, foto_int: parse(fotos.foto_int), foto_out: parse(fotos.foto_out) });
}));

// =========================================================
// CREAR ORDEN = ingresar el vehículo al taller
// POST /ordenes { id_Vehic, servicios: [id_trabajo, ...], kilometraje, observaciones, foto_int: [...] }
// =========================================================
router.post("/ordenes", h(async (req, res) => {
    const { id_Vehic, kilometraje, observaciones, foto_int } = req.body;
    const servicios = [...new Set((req.body.servicios || []).map(Number).filter(Boolean))];

    if (!id_Vehic) throw err(400, "Seleccione el vehículo");
    if (!servicios.length) throw err(400, "Seleccione al menos un servicio");

    const id_orden = await enTransaccion(async conn => {
        const [[v]] = await conn.query(
            "SELECT id_Vehic, id_client FROM Vehiculos WHERE id_Vehic = ? FOR UPDATE", [id_Vehic]);
        if (!v) throw err(404, "Vehículo no encontrado");

        const [abiertas] = await conn.query(
            "SELECT id_orden FROM Orden_Servicio WHERE id_Vehic = ? AND estado IN (?)",
            [id_Vehic, ACTIVOS]);
        if (abiertas.length)
            throw err(409, `Este vehículo ya está en el taller (orden #${abiertas[0].id_orden}). Agregue los servicios a esa orden.`);

        const [cat] = await conn.query(
            "SELECT id_trabajo, Total FROM List_Trabajo WHERE id_trabajo IN (?)", [servicios]);
        if (cat.length !== servicios.length) throw err(400, "Algún servicio seleccionado no existe");

        const [r] = await conn.query(
            `INSERT INTO Orden_Servicio (id_Vehic, id_client, kilometraje, observaciones, foto_int)
             VALUES (?, ?, ?, ?, ?)`,
            [v.id_Vehic, v.id_client, kilometraje || null, observaciones || null, fotosJSON(foto_int)]);

        // Cada servicio + los repuestos de su receta
        for (const t of cat) {
            const [d] = await conn.query(
                "INSERT INTO Orden_Servicio_Detalle (id_orden, id_trabajo, precio) VALUES (?, ?, ?)",
                [r.insertId, t.id_trabajo, t.Total]);
            await stock.agregarRecetaAOrden(conn, r.insertId, d.insertId, t.id_trabajo);
        }
        await registrarEstado(conn, r.insertId, "RECIBIDO", req);
        return r.insertId;
    });

    // Aviso (no bloquea): repuestos de la receta sin stock suficiente
    const [faltan] = await db.query(`
        SELECT p.nombre, p.unidad, p.stock, SUM(r.cantidad) AS necesita
        FROM Orden_Servicio_Repuesto r JOIN Producto p ON p.id_producto = r.id_producto
        WHERE r.id_orden = ? GROUP BY p.id_producto HAVING necesita > p.stock`, [id_orden]);

    res.json({
        message: "Vehículo ingresado al taller",
        id_orden,
        aviso_stock: faltan.length
            ? "Falta stock para iniciar: " + faltan.map(f => `${f.nombre} (hay ${Number(f.stock)}, necesita ${Number(f.necesita)} ${f.unidad})`).join("; ")
            : null
    });
}));

// =========================================================
// AGREGAR / QUITAR servicios de una orden activa
// =========================================================
router.post("/ordenes/:id/servicios", h(async (req, res) => {
    await enTransaccion(async conn => {
        const o = await ordenEditable(conn, req.params.id);
        const [[t]] = await conn.query("SELECT id_trabajo, Total FROM List_Trabajo WHERE id_trabajo = ?",
            [req.body.id_trabajo]);
        if (!t) throw err(404, "Servicio no encontrado");
        const [d] = await conn.query(
            "INSERT INTO Orden_Servicio_Detalle (id_orden, id_trabajo, precio, id_trab) VALUES (?, ?, ?, ?)",
            [o.id_orden, t.id_trabajo, t.Total, req.body.id_trab || null]);
        await stock.agregarRecetaAOrden(conn, o.id_orden, d.insertId, t.id_trabajo);

        // Si el trabajo ya inició, los repuestos salen de bodega de una vez
        if (stock.ESTADOS_CONSUMO.includes(o.estado)) {
            const [ids] = await conn.query("SELECT id_rep FROM Orden_Servicio_Repuesto WHERE id_detalle = ?", [d.insertId]);
            if (ids.length) await stock.consumirRepuestosOrden(conn, o.id_orden, ids.map(x => x.id_rep));
        }
    });
    res.json({ message: "Servicio agregado" });
}));

// Asignar mecánico a un servicio
router.put("/ordenes/:id/servicios/:idDet", h(async (req, res) => {
    exigir(req, "ordenes.ver_todas");   // asignar mecánicos es del Jefe de Taller
    await enTransaccion(async conn => {
        await ordenEditable(conn, req.params.id);
        await conn.query("UPDATE Orden_Servicio_Detalle SET id_trab = ? WHERE id_detalle = ? AND id_orden = ?",
            [req.body.id_trab || null, req.params.idDet, req.params.id]);
    });
    res.json({ message: "Mecánico asignado" });
}));

router.delete("/ordenes/:id/servicios/:idDet", h(async (req, res) => {
    await enTransaccion(async conn => {
        await ordenEditable(conn, req.params.id);
        const [[{ n }]] = await conn.query(
            "SELECT COUNT(*) AS n FROM Orden_Servicio_Detalle WHERE id_orden = ?", [req.params.id]);
        if (n <= 1) throw err(400, "La orden debe tener al menos un servicio (o cancele la orden)");

        const [[d]] = await conn.query(
            "SELECT precio FROM Orden_Servicio_Detalle WHERE id_detalle = ? AND id_orden = ?",
            [req.params.idDet, req.params.id]);
        if (!d) throw err(404, "Servicio no encontrado en la orden");

        const [[vt]] = await conn.query("SELECT total, pagado FROM v_orden_total WHERE id_orden = ?", [req.params.id]);
        if (r2(vt.total - d.precio) < Number(vt.pagado))
            throw err(400, "No se puede quitar: el cliente ya pagó más que el nuevo total");

        // Devolver a bodega los repuestos de ese servicio y borrarlos de la orden
        const [reps] = await conn.query("SELECT id_rep FROM Orden_Servicio_Repuesto WHERE id_detalle = ?", [req.params.idDet]);
        if (reps.length) await stock.devolverRepuestosOrden(conn, req.params.id, reps.map(x => x.id_rep));
        await conn.query("DELETE FROM Orden_Servicio_Detalle WHERE id_detalle = ?", [req.params.idDet]);
    });
    res.json({ message: "Servicio quitado" });
}));

// =========================================================
// REPUESTOS ADICIONALES en la orden
// POST /ordenes/:id/repuestos { id_producto, cantidad, cobrar (true por defecto) }
// =========================================================
router.post("/ordenes/:id/repuestos", h(async (req, res) => {
    await verificarPropia(req, req.params.id);
    const cantidad = r2(req.body.cantidad);
    if (!req.body.id_producto) throw err(400, "Seleccione el repuesto");
    if (!(cantidad > 0)) throw err(400, "La cantidad debe ser mayor que 0");
    const cobrar = req.body.cobrar === false || req.body.cobrar === 0 ? 0 : 1;

    await enTransaccion(async conn => {
        const o = await ordenEditable(conn, req.params.id);
        const [[p]] = await conn.query(
            "SELECT id_producto, precio_venta, costo_promedio, activo FROM Producto WHERE id_producto = ?",
            [req.body.id_producto]);
        if (!p || !p.activo) throw err(404, "Repuesto no encontrado");

        const [r] = await conn.query(
            `INSERT INTO Orden_Servicio_Repuesto (id_orden, id_producto, cantidad, precio_unit, costo_unit, cobrar)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [o.id_orden, p.id_producto, cantidad, cobrar ? p.precio_venta : 0, p.costo_promedio, cobrar]);

        if (stock.ESTADOS_CONSUMO.includes(o.estado))
            await stock.consumirRepuestosOrden(conn, o.id_orden, [r.insertId]);
    });
    res.json({ message: "Repuesto agregado a la orden" });
}));

router.delete("/ordenes/:id/repuestos/:idRep", h(async (req, res) => {
    await verificarPropia(req, req.params.id);
    await enTransaccion(async conn => {
        await ordenEditable(conn, req.params.id);
        const [[rep]] = await conn.query(
            "SELECT * FROM Orden_Servicio_Repuesto WHERE id_rep = ? AND id_orden = ?",
            [req.params.idRep, req.params.id]);
        if (!rep) throw err(404, "Repuesto no encontrado en la orden");

        if (rep.cobrar) {
            const [[vt]] = await conn.query("SELECT total, pagado FROM v_orden_total WHERE id_orden = ?", [req.params.id]);
            if (r2(vt.total - rep.cantidad * rep.precio_unit) < Number(vt.pagado))
                throw err(400, "No se puede quitar: el cliente ya pagó más que el nuevo total");
        }
        if (rep.descontado) await stock.devolverRepuestosOrden(conn, req.params.id, [rep.id_rep]);
        await conn.query("DELETE FROM Orden_Servicio_Repuesto WHERE id_rep = ?", [rep.id_rep]);
    });
    res.json({ message: "Repuesto quitado de la orden" });
}));

// =========================================================
// CAMBIAR ESTADO (aquí se mueve el inventario)
// PUT /ordenes/:id/estado { estado }
// =========================================================
router.put("/ordenes/:id/estado", h(async (req, res) => {
    const nuevo = req.body.estado;
    // Cancelar: recepción o jefatura. Avanzar el trabajo: quien tenga ordenes.avanzar (técnico: solo las suyas)
    if (nuevo === "CANCELADO") exigir(req, "ordenes.crear", "ordenes.ver_todas");
    else exigir(req, "ordenes.avanzar");
    await verificarPropia(req, req.params.id);
    const o = await obtenerOrden(req.params.id);
    if (!SIGUIENTE[o.estado].includes(nuevo))
        throw err(400, `No se puede pasar de ${o.estado} a ${nuevo}`);
    if (nuevo === "CANCELADO" && Number(o.pagado) > 0)
        throw err(400, "La orden tiene pagos registrados; anúlelos en Caja antes de cancelar");

    await enTransaccion(async conn => {
        await conn.query("SELECT id_orden FROM Orden_Servicio WHERE id_orden = ? FOR UPDATE", [o.id_orden]);

        if (nuevo === "EN_PROCESO") {
            // Inicia el trabajo → salen de bodega los repuestos pendientes (falla si falta stock)
            await stock.consumirRepuestosOrden(conn, o.id_orden);
        }
        if (nuevo === "RECIBIDO" || nuevo === "CANCELADO") {
            await stock.devolverRepuestosOrden(conn, o.id_orden, null,
                nuevo === "CANCELADO" ? `Orden #${o.id_orden} cancelada` : `Orden #${o.id_orden} regresó a recibido`);
        }
        await conn.query("UPDATE Orden_Servicio SET estado = ? WHERE id_orden = ?", [nuevo, o.id_orden]);
        await registrarEstado(conn, o.id_orden, nuevo, req);
    });
    res.json({ message: `Orden #${o.id_orden}: ${nuevo.replace("_", " ").toLowerCase()}` });
}));

// =========================================================
// SALIDA / ENTREGA del vehículo
// PUT /ordenes/:id/salida { id_trab, foto_out: [...], entregar_con_saldo }
// =========================================================
router.put("/ordenes/:id/salida", h(async (req, res) => {
    const o = await obtenerOrden(req.params.id);
    if (o.estado !== "TERMINADO") throw err(400, "Solo se entregan órdenes TERMINADAS");
    if (!req.body.id_trab) throw err(400, "Seleccione el trabajador que entrega");

    const saldo = r2(o.total - o.pagado);
    if (saldo > 0 && !req.body.entregar_con_saldo)
        throw err(402, `La orden tiene saldo pendiente de C$ ${saldo.toFixed(2)}. Cobre en Caja o confirme entregar con saldo.`);

    await enTransaccion(async conn => {
        await conn.query(
            `UPDATE Orden_Servicio SET estado='ENTREGADO', fecha_salida=NOW(), id_trab=?, foto_out=?
             WHERE id_orden=?`,
            [req.body.id_trab, fotosJSON(req.body.foto_out), o.id_orden]);
        await registrarEstado(conn, o.id_orden, "ENTREGADO", req);
    });
    res.json({ message: "Vehículo entregado" });
}));

module.exports = router;
