// =========================================================
// Conexión a la BD (un solo pool compartido por TODOS los módulos)
// =========================================================
const mysql = require("mysql2");

const db = mysql.createPool({
    host: "127.0.0.1",
    port: 3306,
    user: "root",
    password: "Jy221104",
    database: "Taller_rost",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.getConnection((err, conn) => {
    if (err) {
        console.log("❌ Error al conectar BD:", err.message);
        return;
    }
    console.log("✅ Conectado a BD Taller_rost");
    conn.release();
});

module.exports = db;
