// backend/server.js
// Solo arranca la app y "enchufa" cada módulo. La lógica vive en /modulos.
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

app.use(session({
    secret: "Jy221104",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 }
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

app.listen(PORT, () => {
    console.log(`Servidor Taller corriendo en http://localhost:${PORT}`);
});
