// =========================================================
// MATRIZ DE ACCESO A LA API
// Cada petición se compara con esta lista (la PRIMERA regla que coincide manda).
// Basta con tener UNO de los permisos listados. "LOGIN" = cualquier usuario con sesión.
// Si ninguna regla coincide, se NIEGA (así una ruta nueva no queda abierta por olvido).
// =========================================================
const { cargarUsuario, puede } = require("./seguridad");

const LOGIN = "LOGIN";
const PUBLICAS = [
    ["POST", /^\/login$/],
    ["GET",  /^\/check-session$/],
    ["POST", /^\/logout$/],
    ["GET",  /^\/politica-clave$/],
    ["GET",  /^\/publico\/servicios$/],       // sitio para clientes
    ["POST", /^\/publico\/seguimiento$/]
];

const R = (metodo, ruta, ...permisos) => ({ metodo, ruta, permisos });

const REGLAS = [
    // --- sesión ---
    R("POST", /^\/cambiar-clave$/, LOGIN),
    R("GET",  /^\/configuracion$/, LOGIN),
    R("PUT",  /^\/configuracion$/, "usuarios.admin"),

    // --- usuarios y roles ---
    R("PUT",  /^\/usuarios\/\d+\/clave$/, "usuarios.admin", "usuarios.reset"),
    R("GET",  /^\/usuarios$/, "usuarios.admin", "usuarios.reset"),
    R("*",    /^\/usuarios/, "usuarios.admin"),
    R("*",    /^\/roles/, "usuarios.admin"),
    R("GET",  /^\/permisos$/, "usuarios.admin"),

    // --- dashboard / notificaciones ---
    R("GET",  /^\/dashboard\//, "dashboard.ver"),
    R("GET",  /^\/notificaciones\//, LOGIN),

    // --- clientes y vehículos ---
    R("GET",  /^\/clientes$/, "clientes.ver", "ordenes.crear", "agenda.ver", "reportes.ver"),
    R("GET",  /^\/clientes\//, "clientes.ver"),
    R("*",    /^\/clientes/, "clientes.editar"),
    R("GET",  /^\/vehiculos/, "clientes.ver", "ordenes.crear", "reportes.ver"),
    R("*",    /^\/vehiculos/, "clientes.editar"),

    // --- agenda ---
    R("GET",  /^\/agenda/, "agenda.ver"),
    R("*",    /^\/agenda/, "agenda.editar"),

    // --- catálogo de servicios ---
    R("GET",  /^\/trabajos\/\d+\/repuestos$/, "catalogo.ver", "catalogo.recetas"),
    R("PUT",  /^\/trabajos\/\d+\/repuestos$/, "catalogo.recetas"),
    R("GET",  /^\/trabajos$/, "catalogo.ver", "catalogo.recetas", "ordenes.crear", "ordenes.avanzar", "agenda.ver", "reportes.ver"),
    R("*",    /^\/trabajos/, "catalogo.editar"),

    // --- órdenes de servicio (el técnico solo ve las suyas: se filtra dentro de la ruta) ---
    R("GET",  /^\/ordenes/, "ordenes.ver_todas", "ordenes.ver_propias"),
    R("POST", /^\/ordenes$/, "ordenes.crear"),
    R("PUT",  /^\/ordenes\/\d+\/servicios\/\d+$/, "ordenes.avanzar"),
    R("*",    /^\/ordenes\/\d+\/servicios/, "ordenes.crear"),
    R("*",    /^\/ordenes\/\d+\/repuestos/, "ordenes.avanzar"),
    R("PUT",  /^\/ordenes\/\d+\/estado$/, "ordenes.avanzar", "ordenes.crear"),
    R("PUT",  /^\/ordenes\/\d+\/salida$/, "ordenes.entregar"),

    // --- reportes de vehículo ---
    R("GET",  /^\/reportes/, "reportes.ver"),
    R("*",    /^\/reportes/, "reportes.editar"),

    // --- inventario: herramientas y repuestos ---
    R("GET",  /^\/inventario\/alertas$/, "inventario.ver", "compras.ver", "dashboard.ver"),
    R("GET",  /^\/inventario/, "herramientas.ver"),
    R("*",    /^\/inventario/, "herramientas.editar"),
    R("GET",  /^\/productos/, "inventario.ver", "ordenes.avanzar", "catalogo.recetas", "compras.ver"),
    R("*",    /^\/productos/, "inventario.editar"),

    // --- compras y proveedores ---
    R("GET",  /^\/proveedores/, "compras.ver", "inventario.ver"),
    R("*",    /^\/proveedores/, "compras.editar"),
    R("PUT",  /^\/compras\/\d+\/aprobar$/, "compras.aprobar"),
    R("POST", /^\/compras\/\d+\/pagar$/, "compras.pagar"),
    R("GET",  /^\/compras/, "compras.ver"),
    R("*",    /^\/compras/, "compras.editar"),

    // --- caja ---
    R("GET",  /^\/caja\/cuentas-por-cobrar$/, "caja.cxc"),
    R("GET",  /^\/caja\/pendientes$/, "caja.operar", "caja.ver"),
    R("GET",  /^\/caja\//, "caja.ver"),
    R("DELETE", /^\/caja\/movimientos\/\d+$/, "caja.supervisar"),
    R("POST", /^\/caja\/deposito$/, "caja.supervisar"),
    R("POST", /^\/caja\//, "caja.operar"),

    // --- trabajadores ---
    R("GET",  /^\/trabajadores/, "trabajadores.ver", "ordenes.avanzar", "ordenes.entregar", "usuarios.admin"),
    R("*",    /^\/trabajadores/, "trabajadores.editar")
];

/** Middleware: identifica al usuario y aplica la matriz */
async function controlAcceso(req, res, next) {
    try {
        if (req.method === "OPTIONS") return next();
        const ruta = req.path;
        if (PUBLICAS.some(([m, rx]) => m === req.method && rx.test(ruta))) return next();

        if (!req.session?.userId) return res.status(401).json({ message: "Inicie sesión" });
        req.usuario = await cargarUsuario(req.session.userId);
        if (!req.usuario) {
            req.session.destroy(() => {});
            return res.status(401).json({ message: "Su usuario está desactivado o ya no existe" });
        }

        // Contraseña temporal o que ya no cumple la política: solo puede cambiarla
        if (req.usuario.debe_cambiar_clave && !/^\/(cambiar-clave|configuracion)$/.test(ruta))
            return res.status(403).json({ message: "Debe cambiar su contraseña antes de continuar", cambiar_clave: true });

        const regla = REGLAS.find(r => (r.metodo === "*" || r.metodo === req.method) && r.ruta.test(ruta));
        if (!regla) return res.status(403).json({ message: "Ruta sin regla de acceso" });
        if (regla.permisos.includes(LOGIN) || puede(req.usuario, ...regla.permisos)) return next();
        return res.status(403).json({ message: "No tiene permiso para esta acción" });
    } catch (e) { next(e); }
}

module.exports = { controlAcceso, REGLAS };
