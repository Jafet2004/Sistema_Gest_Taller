CREATE DATABASE Taller_rost;
USE Taller_rost;

-- =========================
-- TABLA USUARIO
-- =========================
CREATE TABLE usuario(
    id_user INT AUTO_INCREMENT PRIMARY KEY,
    name_user VARCHAR(15) NOT NULL,
    passw VARCHAR(8) NOT NULL
);

-- =========================
-- TABLA CLIENTES
-- =========================
CREATE TABLE Clientes(
    id_client INT AUTO_INCREMENT PRIMARY KEY,
    pr_name VARCHAR(20) NOT NULL,
    sc_name VARCHAR(20) NOT NULL,
    pr_lastname VARCHAR(20) NOT NULL,
    sc_lastname VARCHAR(20) NOT NULL,
    celular VARCHAR(8) NOT NULL,
    CONSTRAINT chk_cliente_cel CHECK (celular REGEXP '^[587][0-9]{7}$')
);

-- =========================
-- TABLA TRABAJADOR
-- =========================
CREATE TABLE Trabajador(
    id_trab INT AUTO_INCREMENT PRIMARY KEY,
    pr_name VARCHAR(20) NOT NULL,
    sc_name VARCHAR(20) NOT NULL,
    pr_lastname VARCHAR(20) NOT NULL,
    sc_lastname VARCHAR(20) NOT NULL,
    celular VARCHAR(8) NOT NULL,
    CONSTRAINT chk_trab_cel CHECK (celular REGEXP '^[587][0-9]{7}$')
);

-- =========================
-- TABLA LISTA DE TRABAJOS
-- =========================
CREATE TABLE List_Trabajo (
    id_trabajo INT AUTO_INCREMENT PRIMARY KEY,
    Name_trabajo VARCHAR(50) NOT NULL,
    Detalle_trab VARCHAR(100) NOT NULL,
    Compra_Externa TINYINT(1) NOT NULL,
    Costo_Compra DOUBLE NOT NULL,
    Usa_Existencia TINYINT(1) NOT NULL,
    Costo_Existencia DOUBLE NOT NULL,
    Mano_Obra TINYINT(1) NOT NULL,
    Costo_Mano_Obra DOUBLE NOT NULL,
    Total DOUBLE NOT NULL
);


-- =========================
-- TABLA VEHÍCULOS
-- =========================
CREATE TABLE Vehiculos(
    id_Vehic INT AUTO_INCREMENT PRIMARY KEY,
    Marca VARCHAR(20) NOT NULL,
    Modelo VARCHAR(20) NOT NULL,
    Año VARCHAR(15) NOT NULL,
    Numero_chasis VARCHAR(16) NOT NULL,
    Entrada DATETIME,
    foto_int LONGTEXT,
    Salida DATETIME,
    foto_out LONGTEXT,
    id_client INT NOT NULL,
    id_trabajo INT,
    FOREIGN KEY (id_client) REFERENCES Clientes(id_client),
    FOREIGN KEY (id_trabajo) REFERENCES List_Trabajo(id_trabajo),
    foreign key (id_trab) references Trabajador(id_trab)
);

-- =========================
-- TABLA INVENTARIO
-- =========================
Create TABLE Inventario(
    id_invt INT AUTO_INCREMENT PRIMARY KEY,
    name_tool VARCHAR(30) unique NOT NULL,
    marca VARCHAR(25) NOT NULL,
    cantidad INT NOT NULL
);

-- =========================
-- TABLA AGENDA (CORREGIDA Y COMPLETA)
-- =========================
-- Aquí se reflejan las citas próximas
-- Incluye: cliente, trabajo, fecha/hora y descripción
CREATE TABLE Agenda(
    id_cita INT AUTO_INCREMENT PRIMARY KEY,
    id_client INT NOT NULL,
    id_trabajo INT NOT NULL,
    descripcion VARCHAR(100) NOT NULL,
    fecha_hora DATETIME NOT NULL,
    FOREIGN KEY (id_client) REFERENCES Clientes(id_client),
    FOREIGN KEY (id_trabajo) REFERENCES List_Trabajo(id_trabajo)
);

-- =========================
-- TABLA REPORTE VEHÍCULO (COMPLETA)
-- =========================
-- Guarda reporte por vehículo y cliente
-- Contiene:
--  nombre del cliente
--  info completa del vehículo
--  trabajo realizado
--  fecha del reporte
--  observaciones
--  recomendaciones
CREATE TABLE Reporte_Vehiculo(
    id_reporte INT AUTO_INCREMENT PRIMARY KEY,

    id_client INT NOT NULL,
    id_Vehic INT NOT NULL,
    id_trabajo INT NOT NULL,

    fecha_reporte DATETIME NOT NULL,

    observaciones TEXT,
    recomendaciones TEXT,
    FOREIGN KEY (id_client) REFERENCES Clientes(id_client),
    FOREIGN KEY (id_Vehic) REFERENCES Vehiculos(id_Vehic),
    FOREIGN KEY (id_trabajo) REFERENCES List_Trabajo(id_trabajo)
);
