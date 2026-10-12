// backend/server.js
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================
// Middleware
// ======================
app.use(cors({
    origin: "*", // Permitir todas las fuentes para desarrollo
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // TODOS los métodos usados
    credentials: true
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// ======================
// Sesión
// ======================
app.use(session({
    secret: 'Jy221104',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ======================
// Conexión a la BD
// ======================
const db = mysql.createPool({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'Jy221104',
    database: 'Taller_rost',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Probar conexión
db.getConnection((err, conn) => {
    if (err) {
        console.log("❌ Error al conectar BD:", err);
        return;
    }
    console.log("✅ Conectado a BD Taller_rost");
    conn.release();
});


// =========================================================
// 🔐 LOGIN
// =========================================================
app.post("/login", (req, res) => {
    const { name_user, passw } = req.body;

    if (!name_user || !passw)
        return res.status(400).json({ message: "Faltan campos" });

    const query = `SELECT * FROM usuario WHERE name_user = ?`;
    db.query(query, [name_user], (err, results) => {
        if (err) return res.status(500).json({ message: "Error servidor" });

        if (results.length === 0)
            return res.status(401).json({ message: "Credenciales inválidas" });

        if (passw !== results[0].passw)
            return res.status(401).json({ message: "Credenciales inválidas" });

        const user = results[0];

        req.session.userId = user.id_user;
        req.session.username = user.name_user;

        res.json({
            message: "Login exitoso",
            user: {
                id: user.id_user,
                nombre: user.name_user
            }
        });
    });
});

// Verificar sesión
app.get("/check-session", (req, res) => {
    if (req.session.userId) {
        res.json({
            loggedIn: true,
            user: {
                id: req.session.userId,
                nombre: req.session.username
            }
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// Logout
app.post("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ message: "Error al cerrar sesión" });
        res.clearCookie("connect.sid");
        res.json({ message: "Sesión cerrada" });
    });
});


// =========================================================
// CLIENTES (CRUD)
// =========================================================
app.get("/clientes", (req, res) => {
    db.query("SELECT * FROM Clientes", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.post("/clientes", (req, res) => {
    const { pr_name, sc_name, pr_lastname, sc_lastname, celular } = req.body;

    const sql = `
        INSERT INTO Clientes (pr_name, sc_name, pr_lastname, sc_lastname, celular)
        VALUES (?, ?, ?, ?, ?)
    `;
    db.query(sql, [pr_name, sc_name, pr_lastname, sc_lastname, celular], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Cliente creado" });
    });
});

// ELIMINAR cliente
app.delete("/clientes/:id", (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM Clientes WHERE id_client = ?";
    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json({ error: "Error al eliminar cliente", details: err });
        if (results.affectedRows === 0) return res.status(404).json({ message: "Cliente no encontrado" });
        res.json({ message: "Cliente eliminado" });
    });
});

// ACTUALIZAR cliente
app.put("/clientes/:id", (req, res) => {
    const { id } = req.params;
    const { pr_name, sc_name, pr_lastname, sc_lastname, celular } = req.body;

    if (!pr_name || !sc_name || !pr_lastname || !sc_lastname || !celular) {
        return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    const sql = `
        UPDATE Clientes
        SET pr_name = ?, sc_name = ?, pr_lastname = ?, sc_lastname = ?, celular = ?
        WHERE id_client = ?
    `;
    db.query(sql, [pr_name, sc_name, pr_lastname, sc_lastname, celular, id], (err, results) => {
        if (err) return res.status(500).json({ error: "Error al actualizar cliente", details: err });
        if (results.affectedRows === 0) return res.status(404).json({ message: "Cliente no encontrado" });
        res.json({ message: "Cliente actualizado" });
    });
});

// =========================================================
// TRABAJADORES
// =========================================================
app.get("/trabajadores", (req, res) => {
    db.query("SELECT * FROM Trabajador", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.post("/trabajadores", (req, res) => {
    const { pr_name, sc_name, pr_lastname, sc_lastname, celular } = req.body;

    const sql = `
        INSERT INTO Trabajador (pr_name, sc_name, pr_lastname, sc_lastname, celular)
        VALUES (?, ?, ?, ?, ?)
    `;
    db.query(sql, [pr_name, sc_name, pr_lastname, sc_lastname, celular], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Trabajador creado" });
    });
});
// Actualizar trabajador
app.put("/trabajadores/:id", (req, res) => {
    const { id } = req.params;
    const { pr_name, sc_name, pr_lastname, sc_lastname, celular } = req.body;

    const sql = `
        UPDATE Trabajador
        SET pr_name=?, sc_name=?, pr_lastname=?, sc_lastname=?, celular=?
        WHERE id_trab=?
    `;

    db.query(sql, [pr_name, sc_name, pr_lastname, sc_lastname, celular, id], (err) => {
        if (err) return res.status(500).json(err);

        res.json({ message: "Trabajador actualizado" });
    });
});

// Eliminar trabajador
app.delete("/trabajadores/:id", (req, res) => {
    const { id } = req.params;

    const sql = "DELETE FROM Trabajador WHERE id_trab=?";

    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json(err);

        res.json({ message: "Trabajador eliminado" });
    });
});


// =========================================================
// TRABAJOS / SERVICIOS
// =========================================================
// ===============================
// CALCULAR TOTAL (BACKEND)
// ===============================
function calcularTotal(data) {
    return (
        Number(data.Costo_Compra || 0) +
        Number(data.Costo_Existencia || 0) +
        Number(data.Costo_Mano_Obra || 0)
    );
}

// ===============================
// OBTENER SERVICIOS
// ===============================
app.get("/trabajos", (req, res) => {
    db.query("SELECT * FROM List_Trabajo", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// ===============================
// CREAR SERVICIO
// ===============================
app.post("/trabajos", (req, res) => {
    const {
        Name_trabajo,
        Detalle_trab,
        Compra_Externa,
        Costo_Compra,
        Usa_Existencia,
        Costo_Existencia,
        Mano_Obra,
        Costo_Mano_Obra
    } = req.body;

    if (!Name_trabajo || !Detalle_trab) {
        return res.status(400).json({ message: "Datos incompletos" });
    }

    const Total = calcularTotal({
        Costo_Compra,
        Costo_Existencia,
        Costo_Mano_Obra
    });

    const sql = `
        INSERT INTO List_Trabajo
        (Name_trabajo, Detalle_trab, Compra_Externa, Costo_Compra,
         Usa_Existencia, Costo_Existencia, Mano_Obra, Costo_Mano_Obra, Total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [
        Name_trabajo,
        Detalle_trab,
        Compra_Externa,
        Costo_Compra,
        Usa_Existencia,
        Costo_Existencia,
        Mano_Obra,
        Costo_Mano_Obra,
        Total
    ], err => {
        if (err) return res.status(500).json(err);

        res.json({
            message: "Servicio registrado correctamente",
            Total
        });
    });
});

// ===============================
// ACTUALIZAR SERVICIO
// ===============================
app.put("/trabajos/:id", (req, res) => {
    const { id } = req.params;

    const {
        Name_trabajo,
        Detalle_trab,
        Compra_Externa,
        Costo_Compra,
        Usa_Existencia,
        Costo_Existencia,
        Mano_Obra,
        Costo_Mano_Obra
    } = req.body;

    const Total = calcularTotal({
        Costo_Compra,
        Costo_Existencia,
        Costo_Mano_Obra
    });

    const sql = `
        UPDATE List_Trabajo SET
            Name_trabajo=?,
            Detalle_trab=?,
            Compra_Externa=?,
            Costo_Compra=?,
            Usa_Existencia=?,
            Costo_Existencia=?,
            Mano_Obra=?,
            Costo_Mano_Obra=?,
            Total=?
        WHERE id_trabajo=?
    `;

    db.query(sql, [
        Name_trabajo,
        Detalle_trab,
        Compra_Externa,
        Costo_Compra,
        Usa_Existencia,
        Costo_Existencia,
        Mano_Obra,
        Costo_Mano_Obra,
        Total,
        id
    ], (err, result) => {
        if (err) return res.status(500).json(err);
        if (result.affectedRows === 0)
            return res.status(404).json({ message: "Servicio no encontrado" });

        res.json({
            message: "Servicio actualizado correctamente",
            Total
        });
    });
});

// ===============================
// ELIMINAR SERVICIO
// ===============================
app.delete("/trabajos/:id", (req, res) => {
    db.query(
        "DELETE FROM List_Trabajo WHERE id_trabajo=?",
        [req.params.id],
        (err, result) => {
            if (err) return res.status(500).json(err);
            if (result.affectedRows === 0)
                return res.status(404).json({ message: "Servicio no encontrado" });

            res.json({ message: "Servicio eliminado correctamente" });
        }
    );
});


// =========================================================
// VEHÍCULOS - ENDPOINTS COMPLETOS
// =========================================================

// 1. GET TODOS LOS VEHÍCULOS
app.get("/vehiculos", (req, res) => {
    const sql = `
        SELECT v.*, 
               c.pr_name, c.sc_name, c.pr_lastname, c.sc_lastname, 
               t.Name_trabajo
        FROM Vehiculos v
        LEFT JOIN Clientes c ON v.id_client = c.id_client
        LEFT JOIN List_Trabajo t ON v.id_trabajo = t.id_trabajo
        ORDER BY v.id_Vehic DESC
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error en GET /vehiculos:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// 2. GET VEHÍCULO ESPECÍFICO (PARA VIEW_CAR.HTML)
app.get("/vehiculos/:id", (req, res) => {
    const { id } = req.params;
    
    const sql = `
        SELECT v.*, 
               c.pr_name, c.sc_name, c.pr_lastname, c.sc_lastname, 
               c.id_client,
               t.Name_trabajo,
               t.id_trabajo
        FROM Vehiculos v
        LEFT JOIN Clientes c ON v.id_client = c.id_client
        LEFT JOIN List_Trabajo t ON v.id_trabajo = t.id_trabajo
        WHERE v.id_Vehic = ?
    `;
    
    db.query(sql, [id], (err, results) => {
        if (err) {
            console.error('Error en GET /vehiculos/:id:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: "Vehículo no encontrado" });
        }
        
        // Procesar imágenes para compatibilidad
        const vehiculo = results[0];
        
        // Convertir fotos_int de JSON string a array si existe
        if (vehiculo.foto_int && typeof vehiculo.foto_int === 'string') {
            try {
                vehiculo.foto_int = JSON.parse(vehiculo.foto_int);
            } catch (e) {
                // Si no es JSON válido, mantener como está (para compatibilidad con foto_int individual)
                console.log('foto_int no es JSON válido, manteniendo como string');
            }
        }
        
        // Convertir fotos_out de JSON string a array si existe
        if (vehiculo.foto_out && typeof vehiculo.foto_out === 'string') {
            try {
                vehiculo.foto_out = JSON.parse(vehiculo.foto_out);
            } catch (e) {
                console.log('foto_out no es JSON válido, manteniendo como string');
            }
        }
        
        res.json(vehiculo);
    });
});

// 3. POST NUEVO VEHÍCULO (CORREGIDO)
app.post("/vehiculos", (req, res) => {
    const { 
        Marca, Modelo, Año, Numero_chasis, 
        Entrada, id_client, id_trabajo, 
        foto_int  // Ahora recibe array de imágenes
    } = req.body;

    console.log('Datos recibidos en POST /vehiculos:', {
        Marca, Modelo, Año, Numero_chasis,
        id_client, id_trabajo,
        tieneFotos: !!foto_int,
        tipoFotos: typeof foto_int
    });

    // Validación del número de chasis
    if (Numero_chasis && Numero_chasis.length > 16) {
        return res.status(400).json({ 
            error: "El número de chasis no puede exceder 16 caracteres" 
        });
    }

    // Convertir el array de imágenes a JSON string para la base de datos
    let fotosIntString = null;
    if (foto_int) {
        try {
            console.log('Procesando foto_int:', foto_int.substring(0, 100) + '...');
            
            // Si ya es un string JSON, verificarlo
            if (typeof foto_int === 'string') {
                // Intentar parsear para validar que sea JSON válido
                const parsed = JSON.parse(foto_int);
                console.log('JSON parseado correctamente, tipo:', Array.isArray(parsed) ? 'array' : typeof parsed);
                fotosIntString = foto_int; // Ya es JSON string
            } else {
                // Si es array, convertirlo a JSON string
                console.log('Convirtiendo array a JSON string');
                fotosIntString = JSON.stringify(foto_int);
            }
        } catch (error) {
            console.error('Error procesando imágenes:', error);
            // Para compatibilidad hacia atrás, guardar como string simple
            fotosIntString = foto_int;
        }
    }

    console.log('Valor final para foto_int en BD:', fotosIntString ? fotosIntString.substring(0, 100) + '...' : 'null');

    const sql = `
        INSERT INTO Vehiculos 
        (Marca, Modelo, Año, Numero_chasis, Entrada, id_client, id_trabajo, foto_int)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.query(sql, [
        Marca, Modelo, Año, Numero_chasis, 
        Entrada, id_client, id_trabajo, 
        fotosIntString
    ], (err, result) => {
        if (err) {
            console.error('Error en POST /vehiculos:', err);
            return res.status(500).json({ error: err.message });
        }
        
        console.log('Vehículo insertado con ID:', result.insertId);
        
        res.json({ 
            message: "Vehículo registrado exitosamente",
            id: result.insertId,
            fotosGuardadas: fotosIntString ? true : false
        });
    });
});

// 4. PUT REGISTRAR SALIDA (CORREGIDO)
app.put("/vehiculos/salida/:id", (req, res) => {
    const { Salida, foto_out } = req.body;
    const { id } = req.params;

    console.log('Datos de salida recibidos:', {
        id, Salida,
        tieneFotosSalida: !!foto_out,
        tipoFotosSalida: typeof foto_out
    });

    // Convertir el array de imágenes a JSON string
    let fotosOutString = null;
    if (foto_out) {
        try {
            console.log('Procesando foto_out:', foto_out.substring(0, 100) + '...');
            
            if (typeof foto_out === 'string') {
                JSON.parse(foto_out); // Validar que sea JSON
                fotosOutString = foto_out;
            } else {
                fotosOutString = JSON.stringify(foto_out);
            }
        } catch (error) {
            console.error('Error procesando imágenes de salida:', error);
            fotosOutString = foto_out;
        }
    }

    const sql = `
        UPDATE Vehiculos 
        SET Salida = ?, foto_out = ? 
        WHERE id_Vehic = ?
    `;
    
    db.query(sql, [Salida, fotosOutString, id], (err, result) => {
        if (err) {
            console.error('Error en PUT /vehiculos/salida/:id:', err);
            return res.status(500).json({ error: err.message });
        }
        
        console.log('Salida registrada para vehículo ID:', id, 'Filas afectadas:', result.affectedRows);
        
        res.json({ 
            message: "Salida registrada exitosamente",
            fotosGuardadas: fotosOutString ? true : false
        });
    });
});

// 5. PUT ACTUALIZAR VEHÍCULO (NUEVO para modal de edición)
app.put("/vehiculos/:id", (req, res) => {
    const { id } = req.params;
    const { Marca, Modelo, Año, Numero_chasis, id_client, id_trabajo } = req.body;
    
    console.log('Datos para actualizar vehículo ID:', id, req.body);
    
    // Validación del número de chasis
    if (Numero_chasis && Numero_chasis.length > 16) {
        return res.status(400).json({ 
            error: "El número de chasis no puede exceder 16 caracteres" 
        });
    }
    
    const sql = `
        UPDATE Vehiculos 
        SET Marca = ?, Modelo = ?, Año = ?, Numero_chasis = ?,
            id_client = ?, id_trabajo = ?
        WHERE id_Vehic = ?
    `;
    
    db.query(sql, [
        Marca, Modelo, Año, Numero_chasis,
        id_client, id_trabajo, id
    ], (err, result) => {
        if (err) {
            console.error('Error en PUT /vehiculos/:id:', err);
            return res.status(500).json({ error: err.message });
        }
        
        console.log('Vehículo actualizado ID:', id, 'Filas afectadas:', result.affectedRows);
        
        res.json({ 
            message: "Vehículo actualizado exitosamente",
            id: id
        });
    });
});

// 6. DELETE VEHÍCULO
app.delete("/vehiculos/:id", (req, res) => {
    const { id } = req.params;
    
    const sql = "DELETE FROM Vehiculos WHERE id_Vehic = ?";
    
    db.query(sql, [id], (err) => {
        if (err) {
            console.error('Error en DELETE /vehiculos/:id:', err);
            return res.status(500).json({ error: err.message });
        }
        
        res.json({ 
            message: "Vehículo eliminado exitosamente",
            id: id 
        });
    });
});




// =========================================================
// INVENTARIO
// =========================================================
app.get("/inventario", (req, res) => {
    db.query("SELECT * FROM Inventario", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.post("/inventario", (req, res) => {
    const { name_tool, marca, cantidad } = req.body;

    const sql = `
        INSERT INTO Inventario (name_tool, marca, cantidad)
        VALUES (?, ?, ?)
    `;
    db.query(sql, [name_tool, marca, cantidad], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Herramienta registrada" });
    });
});
// =========================
// ELIMINAR INVENTARIO
// =========================
app.delete("/inventario/:id", (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM Inventario WHERE id_invt = ?";
    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.affectedRows === 0)
            return res.status(404).json({ message: "Herramienta no encontrada" });
        res.json({ message: "Herramienta eliminada" });
    });
});

// =========================
// ACTUALIZAR INVENTARIO
// =========================
app.put("/inventario/:id", (req, res) => {
    const { id } = req.params;
    const { name_tool, marca, cantidad } = req.body;

    const sql = `
        UPDATE Inventario
        SET name_tool = ?, marca = ?, cantidad = ?
        WHERE id_invt = ?
    `;
    db.query(sql, [name_tool, marca, cantidad, id], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.affectedRows === 0)
            return res.status(404).json({ message: "Herramienta no encontrada" });
        res.json({ message: "Herramienta actualizada" });
    });
});




// =========================================================
// AGENDA / CITAS
// =========================================================
// OBTENER TODAS LAS CITAS
app.get("/agenda", (req, res) => {
    const sql = `
        SELECT 
            a.*,
            CONCAT(c.pr_name, ' ', c.pr_lastname) AS cliente,
            t.Name_trabajo AS trabajo
        FROM Agenda a
        JOIN Clientes c ON c.id_client = a.id_client
        JOIN List_Trabajo t ON t.id_trabajo = a.id_trabajo
        ORDER BY fecha_hora ASC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// OBTENER UNA CITA POR ID
app.get("/agenda/:id", (req, res) => {
    const sql = "SELECT * FROM Agenda WHERE id_cita = ?";
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results[0]);
    });
});

// CREAR CITA
app.post("/agenda", (req, res) => {
    const { id_client, id_trabajo, descripcion, fecha_hora } = req.body;

    const sql = `
        INSERT INTO Agenda (id_client, id_trabajo, descripcion, fecha_hora)
        VALUES (?, ?, ?, ?)
    `;
    db.query(sql, [id_client, id_trabajo, descripcion, fecha_hora], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Cita registrada" });
    });
});

// ACTUALIZAR CITA
app.put("/agenda/:id", (req, res) => {
    const { id_client, id_trabajo, descripcion, fecha_hora } = req.body;

    const sql = `
        UPDATE Agenda 
        SET id_client=?, id_trabajo=?, descripcion=?, fecha_hora=?
        WHERE id_cita=?
    `;
    db.query(sql, [id_client, id_trabajo, descripcion, fecha_hora, req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Cita actualizada correctamente" });
    });
});

// ELIMINAR CITA
app.delete("/agenda/:id", (req, res) => {
    const sql = "DELETE FROM Agenda WHERE id_cita = ?";
    db.query(sql, [req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Cita eliminada correctamente" });
    });
});

// =========================================================
// NOTIFICACIONES: Citas próximas en 7 días
// =========================================================
app.get("/notificaciones/citas-proximas", (req, res) => {
    const sql = `
        SELECT a.*, c.pr_name, c.sc_name, c.pr_lastname, c.sc_lastname, t.Name_trabajo
        FROM Agenda a
        JOIN Clientes c ON a.id_client = c.id_client
        JOIN List_Trabajo t ON a.id_trabajo = t.id_trabajo
        WHERE a.fecha_hora BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
        ORDER BY a.fecha_hora ASC
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});


// =========================================================
// REPORTES - CRUD COMPLETO
// =========================================================

// Obtener todos los reportes
// Obtener un reporte por ID
app.get("/reportes/:id", (req, res) => {
    const { id } = req.params;

    const sql = `
        SELECT r.*,
               c.pr_name, c.pr_lastname,
               v.Marca, v.Modelo,
               t.Name_trabajo
        FROM Reporte_Vehiculo r
        JOIN Clientes c ON c.id_client = r.id_client
        JOIN Vehiculos v ON v.id_Vehic = r.id_Vehic
        JOIN List_Trabajo t ON t.id_trabajo = r.id_trabajo
        WHERE r.id_reporte = ?
    `;

    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.length === 0)
            return res.status(404).json({ message: "Reporte no encontrado" });

        res.json(results[0]);
    });
});


// Crear reporte
app.post("/reportes", (req, res) => {
    const { id_client, id_Vehic, id_trabajo, fecha_reporte, observaciones, recomendaciones } = req.body;

    const sql = `
        INSERT INTO Reporte_Vehiculo (id_client, id_Vehic, id_trabajo, fecha_reporte, observaciones, recomendaciones)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [id_client, id_Vehic, id_trabajo, fecha_reporte, observaciones, recomendaciones], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Reporte creado" });
    });
});

// Actualizar reporte
app.put("/reportes/:id", (req, res) => {
    const { id } = req.params;
    const { id_client, id_Vehic, id_trabajo, fecha_reporte, observaciones, recomendaciones } = req.body;

    const sql = `
        UPDATE Reporte_Vehiculo
        SET id_client=?, id_Vehic=?, id_trabajo=?, fecha_reporte=?, observaciones=?, recomendaciones=?
        WHERE id_reporte=?
    `;

    db.query(sql, [id_client, id_Vehic, id_trabajo, fecha_reporte, observaciones, recomendaciones, id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Reporte actualizado" });
    });
});

// Eliminar reporte
app.delete("/reportes/:id", (req, res) => {
    const { id } = req.params;

    const sql = `DELETE FROM Reporte_Vehiculo WHERE id_reporte=?`;

    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Reporte eliminado" });
    });
});


// =========================================================
// 📊 DASHBOARD - ESTADÍSTICAS
// =========================================================

// 1. ESTADÍSTICAS GENERALES DEL DASHBOARD
app.get("/dashboard/estadisticas", (req, res) => {
    const estadisticas = {};

    // Obtener total de clientes
    db.query("SELECT COUNT(*) as total FROM Clientes", (err, result) => {
        if (err) {
            console.error("Error al contar clientes:", err);
            return res.status(500).json({ error: "Error al contar clientes" });
        }
        estadisticas.totalClientes = result[0].total || 0;

        // Obtener total de vehículos EN TALLER (sin salida)
        db.query("SELECT COUNT(*) as total FROM Vehiculos WHERE Salida IS NULL", (err, result) => {
            if (err) {
                console.error("Error al contar vehículos:", err);
                return res.status(500).json({ error: "Error al contar vehículos" });
            }
            estadisticas.vehiculosEnTaller = result[0].total || 0;

            // Obtener total de vehículos TOTALES
            db.query("SELECT COUNT(*) as total FROM Vehiculos", (err, result) => {
                if (err) {
                    console.error("Error al contar total vehículos:", err);
                    return res.status(500).json({ error: "Error al contar total vehículos" });
                }
                estadisticas.totalVehiculos = result[0].total || 0;

                // Obtener total de trabajadores
                db.query("SELECT COUNT(*) as total FROM Trabajador", (err, result) => {
                    if (err) {
                        console.error("Error al contar trabajadores:", err);
                        return res.status(500).json({ error: "Error al contar trabajadores" });
                    }
                    estadisticas.totalTrabajadores = result[0].total || 0;

                    // Obtener total en inventario
                    db.query("SELECT SUM(cantidad) as total FROM Inventario", (err, result) => {
                        if (err) {
                            console.error("Error al sumar inventario:", err);
                            return res.status(500).json({ error: "Error al sumar inventario" });
                        }
                        estadisticas.totalInventario = result[0].total || 0;

                        // Calcular vehículos por semana (últimos 30 días)
                        const fechaLimite = new Date();
                        fechaLimite.setDate(fechaLimite.getDate() - 30);
                        const fechaLimiteStr = fechaLimite.toISOString().split('T')[0];
                        
                        db.query(
                            "SELECT COUNT(*) as total FROM Vehiculos WHERE Entrada >= ?",
                            [fechaLimiteStr],
                            (err, result) => {
                                if (err) {
                                    console.error("Error al calcular vehículos 30 días:", err);
                                    return res.status(500).json({ error: "Error al calcular vehículos 30 días" });
                                }
                                const vehiculos30Dias = result[0].total || 0;
                                estadisticas.vehiculosPorSemana = (vehiculos30Dias / 4.3).toFixed(1);

                                // Calcular vehículos por cliente
                                db.query(`
                                    SELECT 
                                        COUNT(DISTINCT id_client) as clientesConVehiculos,
                                        COUNT(*) as totalVehiculos
                                    FROM Vehiculos
                                    WHERE id_client IS NOT NULL
                                `, (err, result) => {
                                    if (err) {
                                        console.error("Error al calcular vehículos por cliente:", err);
                                        return res.status(500).json({ error: "Error al calcular vehículos por cliente" });
                                    }
                                    
                                    const clientesConVehiculos = result[0]?.clientesConVehiculos || 0;
                                    const totalVehiculos = result[0]?.totalVehiculos || 0;
                                    
                                    estadisticas.vehiculosPorCliente = clientesConVehiculos > 0 
                                        ? (totalVehiculos / clientesConVehiculos).toFixed(1) 
                                        : 0;

                                    // Vehículos por marca (TOP 6)
                                    db.query(`
                                        SELECT 
                                            COALESCE(Marca, 'Sin marca') as Marca, 
                                            COUNT(*) as cantidad
                                        FROM Vehiculos
                                        GROUP BY Marca
                                        ORDER BY cantidad DESC
                                        LIMIT 6
                                    `, (err, result) => {
                                        if (err) {
                                            console.error("Error al obtener marcas:", err);
                                            return res.status(500).json({ error: "Error al obtener marcas" });
                                        }
                                        estadisticas.distribucionMarcas = result;

                                        // Top 5 clientes con más vehículos
                                        db.query(`
                                            SELECT 
                                                c.id_client,
                                                CONCAT(c.pr_name, ' ', COALESCE(c.pr_lastname, '')) as nombre,
                                                COUNT(v.id_Vehic) as total_vehiculos
                                            FROM Clientes c
                                            LEFT JOIN Vehiculos v ON c.id_client = v.id_client
                                            GROUP BY c.id_client, c.pr_name, c.pr_lastname
                                            ORDER BY total_vehiculos DESC
                                            LIMIT 5
                                        `, (err, result) => {
                                            if (err) {
                                                console.error("Error al obtener top clientes:", err);
                                                return res.status(500).json({ error: "Error al obtener top clientes" });
                                            }
                                            estadisticas.topClientes = result;

                                            // Vehículos por semana (últimas 4 semanas)
                                            db.query(`
                                                SELECT 
                                                    WEEK(Entrada) as semana,
                                                    YEAR(Entrada) as año,
                                                    COUNT(*) as cantidad
                                                FROM Vehiculos
                                                WHERE Entrada >= DATE_SUB(NOW(), INTERVAL 4 WEEK)
                                                GROUP BY YEAR(Entrada), WEEK(Entrada)
                                                ORDER BY año DESC, semana DESC
                                                LIMIT 4
                                            `, (err, result) => {
                                                if (err) {
                                                    console.error("Error al obtener semanas:", err);
                                                    return res.status(500).json({ error: "Error al obtener semanas" });
                                                }
                                                
                                                // Ordenar las semanas correctamente (más antigua a más reciente)
                                                const semanasOrdenadas = result.sort((a, b) => {
                                                    if (a.año !== b.año) return a.año - b.año;
                                                    return a.semana - b.semana;
                                                });
                                                
                                                estadisticas.vehiculosUltimasSemanas = semanasOrdenadas;
                                                
                                                console.log("✅ Estadísticas enviadas:", estadisticas);
                                                res.json(estadisticas);
                                            });
                                        });
                                    });
                                });
                            }
                        );
                    });
                });
            });
        });
    });
});

// 2. VEHÍCULOS RECIENTES (últimos 10)
app.get("/dashboard/vehiculos-recientes", (req, res) => {
    const query = `
        SELECT 
            v.*,
            CONCAT(COALESCE(c.pr_name, ''), ' ', COALESCE(c.pr_lastname, '')) as cliente_nombre,
            t.Name_trabajo as servicio,
            CASE 
                WHEN v.Salida IS NULL THEN 'En taller'
                ELSE 'Completado'
            END as estado
        FROM Vehiculos v
        LEFT JOIN Clientes c ON v.id_client = c.id_client
        LEFT JOIN List_Trabajo t ON v.id_trabajo = t.id_trabajo
        ORDER BY v.Entrada DESC
        LIMIT 10
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error("Error al obtener vehículos recientes:", err);
            return res.status(500).json({ error: "Error al obtener vehículos recientes" });
        }
        res.json(results);
    });
});

// 3. RESUMEN DEL DÍA
app.get("/dashboard/resumen-dia", (req, res) => {
    const hoy = new Date().toISOString().split('T')[0];
    
    const query = `
        SELECT 
            (SELECT COUNT(*) FROM Vehiculos WHERE DATE(Entrada) = ?) as vehiculos_hoy,
            (SELECT COUNT(*) FROM Vehiculos WHERE Salida IS NULL) as vehiculos_en_taller,
            (SELECT COUNT(*) FROM Agenda WHERE DATE(fecha_hora) = ?) as citas_hoy,
            (SELECT COALESCE(SUM(Total), 0) FROM List_Trabajo WHERE DATE(fecha_creacion) = ?) as ingresos_hoy
    `;
    
    db.query(query, [hoy, hoy, hoy], (err, results) => {
        if (err) {
            console.error("Error al obtener resumen del día:", err);
            return res.status(500).json({ error: "Error al obtener resumen del día" });
        }
        res.json(results[0] || {});
    });
});




// =========================================================
// INICIO DEL SERVIDOR
// =========================================================
app.listen(PORT, () => {
    console.log(`🚗 Servidor Taller corriendo en http://localhost:${PORT}`);
});
