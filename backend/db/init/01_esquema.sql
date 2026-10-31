-- =========================================================
-- Taller Rostrán · ESQUEMA COMPLETO (26 tablas + vista)
-- Se ejecuta SOLO la primera vez que se crea el contenedor de MySQL
-- (carpeta /docker-entrypoint-initdb.d). Si el volumen ya existe, no se vuelve a correr.
--
-- Origen: el script exportado de MySQL Workbench, con tres correcciones:
--   1. Cada CREATE TABLE ahora termina en ";" (el original no los traía).
--   2. FOREIGN_KEY_CHECKS=0 mientras se crea todo, porque en el original unas
--      tablas apuntan a otras que aún no existen (usuario→rol, vehiculos→clientes...).
--   3. Se agrega la vista v_orden_total, que el sistema usa en Caja, Órdenes,
--      Historial de vehículos y la consulta del cliente, y que el original no incluía.
-- =========================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `usuario` (
  `id_user` int NOT NULL AUTO_INCREMENT,
  `name_user` varchar(30) NOT NULL,
  `passw` varchar(255) NOT NULL,
  `id_rol` int NOT NULL,
  `id_trab` int DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `debe_cambiar_clave` tinyint(1) NOT NULL DEFAULT '0',
  `ultimo_acceso` datetime DEFAULT NULL,
  PRIMARY KEY (`id_user`),
  UNIQUE KEY `uq_usuario_nombre` (`name_user`),
  KEY `fk_usuario_rol` (`id_rol`),
  KEY `fk_usuario_trab` (`id_trab`),
  CONSTRAINT `fk_usuario_rol` FOREIGN KEY (`id_rol`) REFERENCES `rol` (`id_rol`),
  CONSTRAINT `fk_usuario_trab` FOREIGN KEY (`id_trab`) REFERENCES `trabajador` (`id_trab`) ON DELETE SET NULL
);

CREATE TABLE `trabajador` (
  `id_trab` int NOT NULL AUTO_INCREMENT,
  `pr_name` varchar(20) NOT NULL,
  `sc_name` varchar(20) NOT NULL,
  `pr_lastname` varchar(20) NOT NULL,
  `sc_lastname` varchar(20) NOT NULL,
  `celular` varchar(8) NOT NULL,
  `puesto` varchar(60) DEFAULT NULL,
  `especialidad` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`id_trab`),
  CONSTRAINT `chk_trab_cel` CHECK (regexp_like(`celular`,_utf8mb4'^[587][0-9]{7}$'))
);

CREATE TABLE `vehiculos` (
  `id_Vehic` int NOT NULL AUTO_INCREMENT,
  `Marca` varchar(20) NOT NULL,
  `Modelo` varchar(20) NOT NULL,
  `Año` varchar(15) NOT NULL,
  `Numero_chasis` varchar(16) NOT NULL,
  `Entrada` datetime DEFAULT NULL,
  `foto_int` longtext,
  `Salida` datetime DEFAULT NULL,
  `foto_out` longtext,
  `id_client` int NOT NULL,
  `id_trabajo` int DEFAULT NULL,
  `id_trab` int DEFAULT NULL,
  PRIMARY KEY (`id_Vehic`),
  KEY `id_client` (`id_client`),
  KEY `id_trabajo` (`id_trabajo`),
  KEY `fk_trabajador` (`id_trab`),
  CONSTRAINT `fk_trabajador` FOREIGN KEY (`id_trab`) REFERENCES `trabajador` (`id_trab`),
  CONSTRAINT `vehiculos_ibfk_1` FOREIGN KEY (`id_client`) REFERENCES `clientes` (`id_client`),
  CONSTRAINT `vehiculos_ibfk_2` FOREIGN KEY (`id_trabajo`) REFERENCES `list_trabajo` (`id_trabajo`)
);

CREATE TABLE `servicio_producto` (
  `id_trabajo` int NOT NULL,
  `id_producto` int NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id_trabajo`,`id_producto`),
  KEY `id_producto` (`id_producto`),
  CONSTRAINT `servicio_producto_ibfk_1` FOREIGN KEY (`id_trabajo`) REFERENCES `list_trabajo` (`id_trabajo`) ON DELETE CASCADE,
  CONSTRAINT `servicio_producto_ibfk_2` FOREIGN KEY (`id_producto`) REFERENCES `producto` (`id_producto`),
  CONSTRAINT `chk_sp_cant` CHECK ((`cantidad` > 0))
);

CREATE TABLE `rol` (
  `id_rol` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(30) NOT NULL,
  `nombre` varchar(60) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id_rol`),
  UNIQUE KEY `codigo` (`codigo`)
);

CREATE TABLE `rol_permiso` (
  `id_rol` int NOT NULL,
  `codigo` varchar(40) NOT NULL,
  PRIMARY KEY (`id_rol`,`codigo`),
  KEY `codigo` (`codigo`),
  CONSTRAINT `rol_permiso_ibfk_1` FOREIGN KEY (`id_rol`) REFERENCES `rol` (`id_rol`) ON DELETE CASCADE,
  CONSTRAINT `rol_permiso_ibfk_2` FOREIGN KEY (`codigo`) REFERENCES `permiso` (`codigo`) ON DELETE CASCADE
);

CREATE TABLE `reporte_vehiculo` (
  `id_reporte` int NOT NULL AUTO_INCREMENT,
  `id_client` int NOT NULL,
  `id_Vehic` int NOT NULL,
  `id_trabajo` int NOT NULL,
  `fecha_reporte` datetime NOT NULL,
  `observaciones` text,
  `recomendaciones` text,
  PRIMARY KEY (`id_reporte`),
  KEY `id_client` (`id_client`),
  KEY `id_Vehic` (`id_Vehic`),
  KEY `id_trabajo` (`id_trabajo`),
  CONSTRAINT `reporte_vehiculo_ibfk_1` FOREIGN KEY (`id_client`) REFERENCES `clientes` (`id_client`),
  CONSTRAINT `reporte_vehiculo_ibfk_2` FOREIGN KEY (`id_Vehic`) REFERENCES `vehiculos` (`id_Vehic`),
  CONSTRAINT `reporte_vehiculo_ibfk_3` FOREIGN KEY (`id_trabajo`) REFERENCES `list_trabajo` (`id_trabajo`)
);

CREATE TABLE `proveedor` (
  `id_proveedor` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(80) NOT NULL,
  `contacto` varchar(60) DEFAULT NULL,
  `telefono` varchar(15) DEFAULT NULL,
  `email` varchar(80) DEFAULT NULL,
  `direccion` varchar(150) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_proveedor`)
);

CREATE TABLE `producto` (
  `id_producto` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(30) NOT NULL,
  `nombre` varchar(80) NOT NULL,
  `marca` varchar(40) DEFAULT NULL,
  `unidad` varchar(15) NOT NULL DEFAULT 'unidad',
  `stock` decimal(10,2) NOT NULL DEFAULT '0.00',
  `stock_minimo` decimal(10,2) NOT NULL DEFAULT '0.00',
  `costo_promedio` decimal(12,2) NOT NULL DEFAULT '0.00',
  `precio_venta` decimal(12,2) NOT NULL DEFAULT '0.00',
  `id_proveedor` int DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_producto`),
  UNIQUE KEY `codigo` (`codigo`),
  KEY `id_proveedor` (`id_proveedor`),
  CONSTRAINT `producto_ibfk_1` FOREIGN KEY (`id_proveedor`) REFERENCES `proveedor` (`id_proveedor`) ON DELETE SET NULL,
  CONSTRAINT `chk_prod_stock` CHECK ((`stock` >= 0))
);

CREATE TABLE `permiso` (
  `codigo` varchar(40) NOT NULL,
  `modulo` varchar(40) NOT NULL,
  `descripcion` varchar(150) NOT NULL,
  `orden` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`codigo`)
);

CREATE TABLE `orden_servicio` (
  `id_orden` int NOT NULL AUTO_INCREMENT,
  `id_Vehic` int NOT NULL,
  `id_client` int NOT NULL,
  `fecha_entrada` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `kilometraje` int DEFAULT NULL,
  `observaciones` varchar(255) DEFAULT NULL,
  `foto_int` longtext,
  `estado` enum('RECIBIDO','EN_PROCESO','TERMINADO','ENTREGADO','CANCELADO') NOT NULL DEFAULT 'RECIBIDO',
  `fecha_salida` datetime DEFAULT NULL,
  `foto_out` longtext,
  `id_trab` int DEFAULT NULL,
  PRIMARY KEY (`id_orden`),
  KEY `id_client` (`id_client`),
  KEY `id_trab` (`id_trab`),
  KEY `idx_orden_estado` (`estado`),
  KEY `idx_orden_vehic` (`id_Vehic`),
  CONSTRAINT `orden_servicio_ibfk_1` FOREIGN KEY (`id_Vehic`) REFERENCES `vehiculos` (`id_Vehic`),
  CONSTRAINT `orden_servicio_ibfk_2` FOREIGN KEY (`id_client`) REFERENCES `clientes` (`id_client`),
  CONSTRAINT `orden_servicio_ibfk_3` FOREIGN KEY (`id_trab`) REFERENCES `trabajador` (`id_trab`)
);

CREATE TABLE `orden_servicio_repuesto` (
  `id_rep` int NOT NULL AUTO_INCREMENT,
  `id_orden` int NOT NULL,
  `id_detalle` int DEFAULT NULL,
  `id_producto` int NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `precio_unit` decimal(12,2) NOT NULL DEFAULT '0.00',
  `costo_unit` decimal(12,2) NOT NULL DEFAULT '0.00',
  `cobrar` tinyint(1) NOT NULL DEFAULT '0',
  `descontado` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id_rep`),
  KEY `id_orden` (`id_orden`),
  KEY `id_detalle` (`id_detalle`),
  KEY `id_producto` (`id_producto`),
  CONSTRAINT `orden_servicio_repuesto_ibfk_1` FOREIGN KEY (`id_orden`) REFERENCES `orden_servicio` (`id_orden`) ON DELETE CASCADE,
  CONSTRAINT `orden_servicio_repuesto_ibfk_2` FOREIGN KEY (`id_detalle`) REFERENCES `orden_servicio_detalle` (`id_detalle`) ON DELETE CASCADE,
  CONSTRAINT `orden_servicio_repuesto_ibfk_3` FOREIGN KEY (`id_producto`) REFERENCES `producto` (`id_producto`),
  CONSTRAINT `chk_osr_cant` CHECK ((`cantidad` > 0))
);

CREATE TABLE `orden_servicio_detalle` (
  `id_detalle` int NOT NULL AUTO_INCREMENT,
  `id_orden` int NOT NULL,
  `id_trabajo` int NOT NULL,
  `precio` decimal(12,2) NOT NULL,
  `id_trab` int DEFAULT NULL,
  PRIMARY KEY (`id_detalle`),
  KEY `id_orden` (`id_orden`),
  KEY `id_trabajo` (`id_trabajo`),
  KEY `id_trab` (`id_trab`),
  CONSTRAINT `orden_servicio_detalle_ibfk_1` FOREIGN KEY (`id_orden`) REFERENCES `orden_servicio` (`id_orden`) ON DELETE CASCADE,
  CONSTRAINT `orden_servicio_detalle_ibfk_2` FOREIGN KEY (`id_trabajo`) REFERENCES `list_trabajo` (`id_trabajo`),
  CONSTRAINT `orden_servicio_detalle_ibfk_3` FOREIGN KEY (`id_trab`) REFERENCES `trabajador` (`id_trab`)
);

CREATE TABLE `orden_estado_historial` (
  `id_hist` int NOT NULL AUTO_INCREMENT,
  `id_orden` int NOT NULL,
  `estado` enum('RECIBIDO','EN_PROCESO','TERMINADO','ENTREGADO','CANCELADO') NOT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `id_user` int DEFAULT NULL,
  PRIMARY KEY (`id_hist`),
  KEY `id_user` (`id_user`),
  KEY `idx_hist_orden` (`id_orden`,`fecha`),
  CONSTRAINT `orden_estado_historial_ibfk_1` FOREIGN KEY (`id_orden`) REFERENCES `orden_servicio` (`id_orden`) ON DELETE CASCADE,
  CONSTRAINT `orden_estado_historial_ibfk_2` FOREIGN KEY (`id_user`) REFERENCES `usuario` (`id_user`) ON DELETE SET NULL
);

CREATE TABLE `movimiento_inventario` (
  `id_mov` int NOT NULL AUTO_INCREMENT,
  `id_producto` int NOT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `tipo` enum('INICIAL','COMPRA','SALIDA_ORDEN','DEVOLUCION_ORDEN','AJUSTE') NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `costo_unit` decimal(12,2) NOT NULL DEFAULT '0.00',
  `stock_resultante` decimal(10,2) NOT NULL,
  `id_orden` int DEFAULT NULL,
  `id_compra` int DEFAULT NULL,
  `nota` varchar(150) DEFAULT NULL,
  PRIMARY KEY (`id_mov`),
  KEY `id_orden` (`id_orden`),
  KEY `id_compra` (`id_compra`),
  KEY `idx_kardex_prod` (`id_producto`,`fecha`),
  CONSTRAINT `movimiento_inventario_ibfk_1` FOREIGN KEY (`id_producto`) REFERENCES `producto` (`id_producto`),
  CONSTRAINT `movimiento_inventario_ibfk_2` FOREIGN KEY (`id_orden`) REFERENCES `orden_servicio` (`id_orden`) ON DELETE SET NULL,
  CONSTRAINT `movimiento_inventario_ibfk_3` FOREIGN KEY (`id_compra`) REFERENCES `compra` (`id_compra`) ON DELETE SET NULL
);

CREATE TABLE `list_trabajo` (
  `id_trabajo` int NOT NULL AUTO_INCREMENT,
  `Name_trabajo` varchar(50) NOT NULL,
  `Detalle_trab` varchar(100) NOT NULL,
  `Compra_Externa` tinyint(1) NOT NULL,
  `Costo_Compra` double NOT NULL,
  `Usa_Existencia` tinyint(1) NOT NULL,
  `Costo_Existencia` double NOT NULL,
  `Mano_Obra` tinyint(1) NOT NULL,
  `Costo_Mano_Obra` double NOT NULL,
  `Total` double NOT NULL,
  PRIMARY KEY (`id_trabajo`)
);

CREATE TABLE `inventario` (
  `id_invt` int NOT NULL AUTO_INCREMENT,
  `name_tool` varchar(30) NOT NULL,
  `marca` varchar(25) NOT NULL,
  `cantidad` int NOT NULL,
  PRIMARY KEY (`id_invt`),
  UNIQUE KEY `name_tool` (`name_tool`)
);

CREATE TABLE `configuracion` (
  `clave` varchar(50) NOT NULL,
  `valor` varchar(100) NOT NULL,
  `descripcion` varchar(150) DEFAULT NULL,
  PRIMARY KEY (`clave`)
);

CREATE TABLE `compra` (
  `id_compra` int NOT NULL AUTO_INCREMENT,
  `id_proveedor` int NOT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `estado` enum('BORRADOR','ENVIADA','RECIBIDA','CANCELADA') NOT NULL DEFAULT 'BORRADOR',
  `fecha_recepcion` datetime DEFAULT NULL,
  `numero_factura` varchar(40) DEFAULT NULL,
  `observaciones` varchar(255) DEFAULT NULL,
  `aprobada_por` int DEFAULT NULL,
  `fecha_aprobacion` datetime DEFAULT NULL,
  PRIMARY KEY (`id_compra`),
  KEY `id_proveedor` (`id_proveedor`),
  KEY `idx_compra_estado` (`estado`),
  KEY `fk_compra_aprobador` (`aprobada_por`),
  CONSTRAINT `compra_ibfk_1` FOREIGN KEY (`id_proveedor`) REFERENCES `proveedor` (`id_proveedor`),
  CONSTRAINT `fk_compra_aprobador` FOREIGN KEY (`aprobada_por`) REFERENCES `usuario` (`id_user`)
);

CREATE TABLE `compra_detalle` (
  `id_detalle` int NOT NULL AUTO_INCREMENT,
  `id_compra` int NOT NULL,
  `id_producto` int NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `costo_unit` decimal(12,2) NOT NULL DEFAULT '0.00',
  `cantidad_recibida` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id_detalle`),
  KEY `id_compra` (`id_compra`),
  KEY `id_producto` (`id_producto`),
  CONSTRAINT `compra_detalle_ibfk_1` FOREIGN KEY (`id_compra`) REFERENCES `compra` (`id_compra`) ON DELETE CASCADE,
  CONSTRAINT `compra_detalle_ibfk_2` FOREIGN KEY (`id_producto`) REFERENCES `producto` (`id_producto`),
  CONSTRAINT `chk_cd_cant` CHECK ((`cantidad` > 0))
);

CREATE TABLE `clientes` (
  `id_client` int NOT NULL AUTO_INCREMENT,
  `pr_name` varchar(20) NOT NULL,
  `sc_name` varchar(20) NOT NULL,
  `pr_lastname` varchar(20) NOT NULL,
  `sc_lastname` varchar(20) NOT NULL,
  `cedula` varchar(16) DEFAULT NULL,
  `celular` varchar(8) NOT NULL,
  `correo` varchar(100) DEFAULT NULL,
  `passw` varchar(255) DEFAULT NULL,
  `portal_activo` tinyint(1) NOT NULL DEFAULT '1',
  `portal_ultimo_acceso` datetime DEFAULT NULL,
  PRIMARY KEY (`id_client`),
  UNIQUE KEY `uq_cliente_cedula` (`cedula`),
  UNIQUE KEY `uq_cliente_correo` (`correo`),
  CONSTRAINT `chk_cliente_cedula` CHECK (((`cedula` is null) or regexp_like(`cedula`,_utf8mb4'^[0-9]{3}-?[0-9]{6}-?[0-9]{4}[A-Za-z]$'))),
  CONSTRAINT `chk_cliente_cel` CHECK (regexp_like(`celular`,_utf8mb4'^[587][0-9]{7}$')),
  CONSTRAINT `chk_cliente_correo` CHECK (((`correo` is null) or (`correo` like _utf8mb4'%_@_%._%')))
);

CREATE TABLE `caja_sesion` (
  `id_sesion` int NOT NULL AUTO_INCREMENT,
  `id_user` int DEFAULT NULL,
  `fecha_apertura` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `monto_apertura` decimal(12,2) NOT NULL,
  `fecha_cierre` datetime DEFAULT NULL,
  `efectivo_esperado` decimal(12,2) DEFAULT NULL,
  `efectivo_contado` decimal(12,2) DEFAULT NULL,
  `diferencia` decimal(12,2) DEFAULT NULL,
  `estado` enum('ABIERTA','CERRADA') NOT NULL DEFAULT 'ABIERTA',
  `observaciones` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id_sesion`),
  KEY `id_user` (`id_user`),
  KEY `idx_sesion_est` (`estado`),
  CONSTRAINT `caja_sesion_ibfk_1` FOREIGN KEY (`id_user`) REFERENCES `usuario` (`id_user`)
);

CREATE TABLE `caja_movimiento` (
  `id_mov` int NOT NULL AUTO_INCREMENT,
  `id_sesion` int NOT NULL,
  `id_orden` int DEFAULT NULL,
  `id_compra` int DEFAULT NULL,
  `tipo` enum('INGRESO','EGRESO') NOT NULL,
  `concepto` varchar(150) NOT NULL,
  `metodo_pago` enum('EFECTIVO','TARJETA','TRANSFERENCIA') NOT NULL DEFAULT 'EFECTIVO',
  `monto` decimal(12,2) NOT NULL,
  `referencia` varchar(50) DEFAULT NULL,
  `id_Vehic` int DEFAULT NULL,
  `id_client` int DEFAULT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_mov`),
  KEY `id_client` (`id_client`),
  KEY `idx_mov_sesion` (`id_sesion`),
  KEY `idx_mov_vehic` (`id_Vehic`),
  KEY `fk_mov_orden` (`id_orden`),
  KEY `fk_mov_compra` (`id_compra`),
  CONSTRAINT `caja_movimiento_ibfk_1` FOREIGN KEY (`id_sesion`) REFERENCES `caja_sesion` (`id_sesion`),
  CONSTRAINT `caja_movimiento_ibfk_2` FOREIGN KEY (`id_Vehic`) REFERENCES `vehiculos` (`id_Vehic`) ON DELETE SET NULL,
  CONSTRAINT `caja_movimiento_ibfk_3` FOREIGN KEY (`id_client`) REFERENCES `clientes` (`id_client`) ON DELETE SET NULL,
  CONSTRAINT `fk_mov_compra` FOREIGN KEY (`id_compra`) REFERENCES `compra` (`id_compra`) ON DELETE SET NULL,
  CONSTRAINT `fk_mov_orden` FOREIGN KEY (`id_orden`) REFERENCES `orden_servicio` (`id_orden`) ON DELETE SET NULL,
  CONSTRAINT `chk_mov_monto` CHECK ((`monto` > 0))
);

CREATE TABLE `caja_deposito` (
  `id_deposito` int NOT NULL AUTO_INCREMENT,
  `id_sesion` int NOT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `banco` varchar(50) NOT NULL,
  `referencia` varchar(50) NOT NULL,
  `monto` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id_deposito`),
  KEY `id_sesion` (`id_sesion`),
  CONSTRAINT `caja_deposito_ibfk_1` FOREIGN KEY (`id_sesion`) REFERENCES `caja_sesion` (`id_sesion`),
  CONSTRAINT `chk_dep_monto` CHECK ((`monto` > 0))
);

CREATE TABLE `caja_arqueo` (
  `id_arqueo` int NOT NULL AUTO_INCREMENT,
  `id_sesion` int NOT NULL,
  `tipo` enum('PARCIAL','CIERRE') NOT NULL DEFAULT 'PARCIAL',
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `efectivo_esperado` decimal(12,2) NOT NULL,
  `efectivo_contado` decimal(12,2) NOT NULL,
  `diferencia` decimal(12,2) NOT NULL,
  `detalle` json DEFAULT NULL,
  PRIMARY KEY (`id_arqueo`),
  KEY `id_sesion` (`id_sesion`),
  CONSTRAINT `caja_arqueo_ibfk_1` FOREIGN KEY (`id_sesion`) REFERENCES `caja_sesion` (`id_sesion`)
);

CREATE TABLE `agenda` (
  `id_cita` int NOT NULL AUTO_INCREMENT,
  `id_client` int NOT NULL,
  `id_trabajo` int NOT NULL,
  `descripcion` varchar(100) NOT NULL,
  `fecha_hora` datetime NOT NULL,
  PRIMARY KEY (`id_cita`),
  KEY `id_client` (`id_client`),
  KEY `id_trabajo` (`id_trabajo`),
  CONSTRAINT `agenda_ibfk_1` FOREIGN KEY (`id_client`) REFERENCES `clientes` (`id_client`),
  CONSTRAINT `agenda_ibfk_2` FOREIGN KEY (`id_trabajo`) REFERENCES `list_trabajo` (`id_trabajo`)
);

-- ---------------------------------------------------------
-- Vista: total de cada orden (servicios + repuestos cobrables) y lo pagado en caja
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW v_orden_total AS
SELECT x.id_orden,
       x.total_servicios,
       x.total_repuestos,
       ROUND(x.total_servicios + x.total_repuestos, 2) AS total,
       x.pagado
FROM (
    SELECT o.id_orden,
           (SELECT COALESCE(SUM(d.precio), 0)
              FROM orden_servicio_detalle d WHERE d.id_orden = o.id_orden)            AS total_servicios,
           (SELECT COALESCE(SUM(r.cantidad * r.precio_unit), 0)
              FROM orden_servicio_repuesto r WHERE r.id_orden = o.id_orden AND r.cobrar = 1) AS total_repuestos,
           (SELECT COALESCE(SUM(m.monto), 0)
              FROM caja_movimiento m WHERE m.id_orden = o.id_orden AND m.tipo = 'INGRESO')  AS pagado
    FROM orden_servicio o
) x;

SET FOREIGN_KEY_CHECKS = 1;
