// backend/server.js
// Solo arranca la app y "enchufa" cada módulo. La lógica vive en /modulos.

// En desarrollo, lee el archivo .env si existe (en Docker las variables ya vienen puestas
// y esto no las pisa). Requiere Node 20.12 o superior; si no está, simplemente se omite.
if (typeof process.loadEnvFile === "function") { try { process.loadEnvFile(); } catch { /* no hay .env */ } }

const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// ======================
// Middleware
// ======================
app.use(cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Clave con la que se firman las cookies de sesión. En producción es obligatoria
// (si cambia o falta, todas las sesiones abiertas se cierran).
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
    console.error("❌ Falta la variable SESSION_SECRET.");
    process.exit(1);
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

// Chequeo de estado para Docker y el despliegue: responde 200 si la API y la BD están vivas.
// Va ANTES de la sesión y del control de acceso a propósito: no crea sesiones ni pide login.
app.get("/health", async (req, res) => {
    try {
        await require("./config/db").promise().query("SELECT 1");
        res.json({ status: "ok" });
    } catch (e) {
        res.status(503).json({ status: "bd_no_disponible" });
    }
});

// Detrás del proxy de Render/Heroku/etc. la conexión llega como HTTP; esto le dice a Express que confíe
// en el aviso "soy HTTPS" del proxy (sin esto no entrega las cookies seguras).
app.set("trust proxy", 1);

// COOKIE_CROSS_SITE=true cuando el frontend está en OTRO dominio que la API (p. ej. Netlify + Render).
// Entonces la cookie debe ser Secure + SameSite=None; si no, el navegador no la envía y no se mantiene el login.
// En local (http) déjelo sin definir.
const crossSite = process.env.COOKIE_CROSS_SITE === "true";

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: crossSite, sameSite: crossSite ? "none" : "lax", maxAge: 24 * 60 * 60 * 1000 }
}));

// ======================
// CONTROL DE ACCESO: identifica al usuario y aplica la matriz de permisos
// (modulos/auth/reglas.js) ANTES de llegar a cualquier módulo.
// ======================
app.use(require("./modulos/auth/reglas").controlAcceso);

// ======================
// MÓDULOS (según el diagrama)
// Las URLs no cambian: /clientes, /vehiculos, /trabajos, etc.
// ======================

// Sitio público para clientes (seguimiento de su vehículo; no requiere sesión)
app.use(require("./modulos/publico/publico.routes"));
app.use(require("./modulos/publico/portal.routes"));      // login y consultas de clientes

// Autenticación
app.use(require("./modulos/auth/auth.routes"));
app.use(require("./modulos/auth/usuarios.routes"));        // usuarios, roles y permisos (Gerente)

// I. Gestión de cliente (una vez)
app.use(require("./modulos/gestion_cliente/clientes.routes"));
app.use(require("./modulos/gestion_cliente/vehiculos.routes"));

// II. Gestión de servicios (ciclo repetitivo)
app.use(require("./modulos/gestion_servicios/trabajos.routes"));
app.use(require("./modulos/gestion_servicios/agenda.routes"));
app.use(require("./modulos/gestion_servicios/ordenes.routes"));   // ← NUEVO: entrada al taller

// III. Taller (ejecución del servicio)
app.use(require("./modulos/taller/reportes.routes"));

// IV. Gestión de compras e inventario
app.use(require("./modulos/compras/inventario.routes"));     // herramientas (sin cambios)
app.use(require("./modulos/compras/productos.routes"));      // repuestos e insumos con stock + kardex
app.use(require("./modulos/compras/proveedores.routes"));    // proveedores
app.use(require("./modulos/compras/compras.routes"));        // pedidos de compra y recepción

// V. Caja  ← NUEVO
app.use("/caja", require("./modulos/caja/caja.routes"));

// Administración
app.use(require("./modulos/administracion/trabajadores.routes"));
app.use(require("./modulos/administracion/dashboard.routes"));

// ======================
// Manejo de errores general (para rutas async)
// ======================
app.use((err, req, res, next) => {
    console.error("❌", err);
    res.status(err.status || 500).json({ message: err.message || "Error del servidor", data: err.data });
});

const server = app.listen(PORT, () => {
    console.log(`Servidor Taller corriendo en http://localhost:${PORT}`);
});

// Apagado ordenado: "docker stop" y los despliegues envían SIGTERM. Sin esto, Node como
// proceso principal del contenedor lo ignora y Docker lo mata a la fuerza a los 10 s.
for (const senal of ["SIGTERM", "SIGINT"]) {
    process.on(senal, () => {
        console.log(`Recibido ${senal}, cerrando…`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 8000).unref();
    });
}
