// =========================================================
// STOCK: única puerta para mover existencias de repuestos.
// Toda entrada/salida pasa por aquí y queda en el kardex (Movimiento_Inventario).
// Las funciones reciben una conexión con transacción abierta.
// =========================================================
const err = (status, message, data) => Object.assign(new Error(message), { status, data });
const r2 = n => Math.round(Number(n || 0) * 100) / 100;

// Estados de la orden en los que los repuestos ya salieron de bodega
const ESTADOS_CONSUMO = ["EN_PROCESO", "TERMINADO", "ENTREGADO"];

/**
 * Mueve stock de un producto y registra el kardex.
 * @param delta  positivo = entra, negativo = sale
 */
async function moverStock(conn, { id_producto, delta, tipo, costo_unit = null, id_orden = null, id_compra = null, nota = null }) {
    const [[p]] = await conn.query(
        "SELECT id_producto, nombre, stock, costo_promedio FROM Producto WHERE id_producto = ? FOR UPDATE",
        [id_producto]);
    if (!p) throw err(404, "Producto no encontrado");

    const nuevo = r2(Number(p.stock) + Number(delta));
    if (nuevo < 0) throw err(409, `Stock insuficiente de ${p.nombre}: hay ${Number(p.stock)}, se necesitan ${Math.abs(delta)}`);

    await conn.query("UPDATE Producto SET stock = ? WHERE id_producto = ?", [nuevo, id_producto]);
    await conn.query(
        `INSERT INTO Movimiento_Inventario
         (id_producto, tipo, cantidad, costo_unit, stock_resultante, id_orden, id_compra, nota)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id_producto, tipo, r2(delta), costo_unit ?? p.costo_promedio, nuevo, id_orden, id_compra, nota]);
    return nuevo;
}

/**
 * Entrada por compra: suma stock y recalcula el COSTO PROMEDIO PONDERADO.
 * costo nuevo = (stock actual × costo actual + cantidad × costo compra) / (stock actual + cantidad)
 */
async function entradaCompra(conn, { id_producto, cantidad, costo_unit, id_compra }) {
    const [[p]] = await conn.query(
        "SELECT stock, costo_promedio FROM Producto WHERE id_producto = ? FOR UPDATE", [id_producto]);
    if (!p) throw err(404, "Producto no encontrado");
    const stock = Math.max(Number(p.stock), 0);
    const total = stock + Number(cantidad);
    const costo = total > 0
        ? r2((stock * Number(p.costo_promedio) + Number(cantidad) * Number(costo_unit)) / total)
        : Number(costo_unit);
    await conn.query("UPDATE Producto SET costo_promedio = ? WHERE id_producto = ?", [costo, id_producto]);
    return moverStock(conn, { id_producto, delta: cantidad, tipo: "COMPRA", costo_unit, id_compra,
                              nota: `Compra #${id_compra}` });
}

/**
 * Rebaja de bodega los repuestos de una orden que aún no se han descontado.
 * Si falta stock de cualquiera, NO descuenta nada y lanza 409 con la lista de faltantes.
 */
async function consumirRepuestosOrden(conn, id_orden, soloIds = null) {
    let sql = `SELECT r.id_rep, r.id_producto, r.cantidad, p.nombre, p.unidad, p.stock, p.costo_promedio
               FROM Orden_Servicio_Repuesto r
               JOIN Producto p ON p.id_producto = r.id_producto
               WHERE r.id_orden = ? AND r.descontado = 0`;
    const params = [id_orden];
    if (soloIds) { sql += " AND r.id_rep IN (?)"; params.push(soloIds); }
    const [filas] = await conn.query(sql + " FOR UPDATE", params);
    if (!filas.length) return [];

    // Sumar lo requerido por producto (un mismo repuesto puede venir de dos servicios)
    const req = {};
    filas.forEach(f => {
        req[f.id_producto] ??= { nombre: f.nombre, unidad: f.unidad, stock: Number(f.stock), necesita: 0 };
        req[f.id_producto].necesita = r2(req[f.id_producto].necesita + Number(f.cantidad));
    });
    const faltantes = Object.entries(req)
        .filter(([, x]) => x.necesita > x.stock)
        .map(([id, x]) => ({ id_producto: Number(id), ...x, falta: r2(x.necesita - x.stock) }));
    if (faltantes.length) {
        throw err(409,
            "Stock insuficiente: " + faltantes.map(f => `${f.nombre} (hay ${f.stock}, se necesitan ${f.necesita} ${f.unidad})`).join("; "),
            { faltantes });
    }

    for (const f of filas) {
        await moverStock(conn, { id_producto: f.id_producto, delta: -f.cantidad, tipo: "SALIDA_ORDEN",
                                 costo_unit: f.costo_promedio, id_orden, nota: `Orden #${id_orden}` });
        await conn.query("UPDATE Orden_Servicio_Repuesto SET descontado = 1, costo_unit = ? WHERE id_rep = ?",
            [f.costo_promedio, f.id_rep]);
    }
    return filas;
}

/** Regresa a bodega los repuestos ya descontados de una orden (cancelación, quitar servicio, etc.) */
async function devolverRepuestosOrden(conn, id_orden, soloIds = null, nota = null) {
    let sql = `SELECT id_rep, id_producto, cantidad, costo_unit FROM Orden_Servicio_Repuesto
               WHERE id_orden = ? AND descontado = 1`;
    const params = [id_orden];
    if (soloIds) { sql += " AND id_rep IN (?)"; params.push(soloIds); }
    const [filas] = await conn.query(sql + " FOR UPDATE", params);
    for (const f of filas) {
        await moverStock(conn, { id_producto: f.id_producto, delta: f.cantidad, tipo: "DEVOLUCION_ORDEN",
                                 costo_unit: f.costo_unit, id_orden, nota: nota || `Devolución orden #${id_orden}` });
        await conn.query("UPDATE Orden_Servicio_Repuesto SET descontado = 0 WHERE id_rep = ?", [f.id_rep]);
    }
    return filas;
}

/** Copia la receta de un servicio del catálogo a la orden (precio de venta solo como referencia; cobrar = 0) */
async function agregarRecetaAOrden(conn, id_orden, id_detalle, id_trabajo) {
    await conn.query(`
        INSERT INTO Orden_Servicio_Repuesto (id_orden, id_detalle, id_producto, cantidad, precio_unit, costo_unit, cobrar)
        SELECT ?, ?, sp.id_producto, sp.cantidad, p.precio_venta, p.costo_promedio, 0
        FROM Servicio_Producto sp
        JOIN Producto p ON p.id_producto = sp.id_producto
        WHERE sp.id_trabajo = ?`, [id_orden, id_detalle, id_trabajo]);
}

module.exports = {
    ESTADOS_CONSUMO, moverStock, entradaCompra,
    consumirRepuestosOrden, devolverRepuestosOrden, agregarRecetaAOrden
};
