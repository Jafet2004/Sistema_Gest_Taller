// =========================================================
// Conexión a la BD (un solo pool compartido por TODOS los módulos)
// Todo viene de variables de entorno (ver .env.example). Así la misma imagen
// de Docker sirve para desarrollo y producción, y la contraseña no queda en el código.
// =========================================================
const fs = require("fs");
const mysql = require("mysql2");

const {
    DB_HOST = "127.0.0.1",
    DB_PORT = "3306",
    DB_USER = "root",
    DB_PASSWORD,
    DB_NAME = "Taller_rost",
    DB_SSL,          // "true" para bases en la nube que exigen conexión cifrada (TiDB Cloud, PlanetScale…)
    DB_SSL_CA        // opcional: ruta a un certificado CA, si el proveedor lo pide
} = process.env;

if (DB_PASSWORD === undefined) {
    console.error("❌ Falta la variable DB_PASSWORD (copie .env.example a .env y complétela).");
    if (process.env.NODE_ENV === "production") process.exit(1);
}

const db = mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    ssl: DB_SSL === "true"
        ? { minVersion: "TLSv1.2", rejectUnauthorized: true, ...(DB_SSL_CA ? { ca: fs.readFileSync(DB_SSL_CA) } : {}) }
        : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.getConnection((err, conn) => {
    if (err) {
        console.log("❌ Error al conectar BD:", err.message);
        return;
    }
    console.log(`✅ Conectado a BD ${DB_NAME} en ${DB_HOST}:${DB_PORT}`);
    conn.release();
});

module.exports = db;
