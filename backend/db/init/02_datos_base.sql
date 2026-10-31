-- =========================================================
-- Taller Rostrán · DATOS BASE (sin esto nadie puede entrar al sistema)
-- Copiados de sql/05_roles_permisos.sql y sql/06_politica_clave.sql.
--
--  · 8 roles, 31 permisos y la matriz rol → permisos
--  · configuración (monto de aprobación de compras, política de contraseñas)
--  · usuario inicial:  admin / Admin2026  → el sistema obliga a cambiarla al entrar
-- =========================================================
SET NAMES utf8mb4;

INSERT INTO Configuracion VALUES
    ('monto_aprobacion_compras', '10000', 'Compras con total mayor a este monto (C$) requieren aprobación del Gerente');

INSERT INTO Configuracion (clave, valor, descripcion) VALUES
    ('clave_min_longitud',       '8', 'Cantidad mínima de caracteres de la contraseña'),
    ('clave_requiere_letra',     '1', '1 = la contraseña debe tener al menos una letra'),
    ('clave_requiere_numero',    '1', '1 = la contraseña debe tener al menos un número'),
    ('clave_requiere_mayuscula', '0', '1 = la contraseña debe tener al menos una mayúscula'),
    ('clave_requiere_simbolo',   '0', '1 = la contraseña debe tener al menos un símbolo (!@#$...)')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT INTO Rol (codigo, nombre, descripcion) VALUES
 ('PROPIETARIO',   'Propietario / Junta',        'Consulta de todo lo operativo y financiero; no registra'),
 ('GERENTE',       'Gerente General',            'Acceso total. Administra usuarios, roles, precios y aprueba compras'),
 ('ADMIN_FINANZAS','Administración y Finanzas',  'Asistente Administrativo-Contable: supervisa caja, depósitos, cuentas por cobrar y pagos; cajero suplente'),
 ('INVENTARIO',    'Inventario y Compras',       'Encargado de repuestos, herramientas, recetas y pedidos de compra'),
 ('ASESOR',        'Asesor de Servicio y Caja',  'Recepción de clientes y vehículos, órdenes, agenda, postventa y caja diaria'),
 ('JEFE_TALLER',   'Jefe de Taller',             'Asigna mecánicos, avanza órdenes, diagnósticos y herramientas'),
 ('TECNICO',       'Técnico / Mecánico',         'Ve y trabaja solo las órdenes donde está asignado; registra diagnósticos'),
 ('SOPORTE',       'Soporte de Sistemas (externo)', 'Solo restablece contraseñas. Cuenta desactivada salvo mantenimiento');

INSERT INTO Permiso (codigo, modulo, descripcion, orden) VALUES
 ('dashboard.ver',        'Dashboard',              'Ver estadísticas',                                   10),
 ('clientes.ver',         'Clientes y vehículos',   'Consultar clientes, vehículos e historial',          20),
 ('clientes.editar',      'Clientes y vehículos',   'Registrar y editar clientes y vehículos',            21),
 ('agenda.ver',           'Agenda',                 'Ver citas',                                          30),
 ('agenda.editar',        'Agenda',                 'Crear, mover y eliminar citas',                      31),
 ('ordenes.ver_todas',    'Órdenes de servicio',    'Ver todas las órdenes',                              40),
 ('ordenes.ver_propias',  'Órdenes de servicio',    'Ver solo las órdenes donde está asignado',           41),
 ('ordenes.crear',        'Órdenes de servicio',    'Recibir vehículos y agregar o quitar servicios',     42),
 ('ordenes.avanzar',      'Órdenes de servicio',    'Iniciar/terminar trabajo, asignar mecánico, repuestos', 43),
 ('ordenes.entregar',     'Órdenes de servicio',    'Entregar el vehículo al cliente',                    44),
 ('catalogo.ver',         'Catálogo de servicios',  'Ver servicios y precios',                            50),
 ('catalogo.editar',      'Catálogo de servicios',  'Crear servicios y cambiar precios',                  51),
 ('catalogo.recetas',     'Catálogo de servicios',  'Definir repuestos que usa cada servicio',            52),
 ('reportes.ver',         'Reportes de vehículo',   'Ver reportes / diagnósticos',                        60),
 ('reportes.editar',      'Reportes de vehículo',   'Crear y editar reportes / diagnósticos',             61),
 ('caja.ver',             'Caja',                   'Ver estado de caja y movimientos',                   70),
 ('caja.operar',          'Caja',                   'Apertura, cobros, egresos, arqueo y cierre',         71),
 ('caja.supervisar',      'Caja',                   'Anular movimientos y registrar depósitos',           72),
 ('caja.cxc',             'Caja',                   'Ver cuentas por cobrar',                             73),
 ('inventario.ver',       'Inventario',             'Ver repuestos, stock y kardex',                      80),
 ('inventario.editar',    'Inventario',             'Crear repuestos y hacer ajustes de stock',           81),
 ('herramientas.ver',     'Inventario',             'Ver herramientas',                                   82),
 ('herramientas.editar',  'Inventario',             'Registrar y editar herramientas',                    83),
 ('compras.ver',          'Compras',                'Ver pedidos y proveedores',                          90),
 ('compras.editar',       'Compras',                'Crear pedidos, recibir mercadería y gestionar proveedores', 91),
 ('compras.aprobar',      'Compras',                'Aprobar compras que superan el monto límite',        92),
 ('compras.pagar',        'Compras',                'Pagar compras desde la caja',                        93),
 ('trabajadores.ver',     'Trabajadores',           'Ver trabajadores',                                   100),
 ('trabajadores.editar',  'Trabajadores',           'Registrar y editar trabajadores',                    101),
 ('usuarios.admin',       'Usuarios y roles',       'Crear usuarios, asignar roles y editar permisos',    110),
 ('usuarios.reset',       'Usuarios y roles',       'Restablecer contraseñas',                            111);

-- Matriz rol → permisos
INSERT INTO Rol_Permiso (id_rol, codigo)
SELECT r.id_rol, p.codigo FROM Rol r JOIN Permiso p
WHERE r.codigo = 'GERENTE';                                   -- todo

INSERT INTO Rol_Permiso (id_rol, codigo)
SELECT r.id_rol, p.codigo FROM Rol r JOIN Permiso p
WHERE r.codigo = 'PROPIETARIO' AND p.codigo IN
 ('dashboard.ver','clientes.ver','agenda.ver','ordenes.ver_todas','catalogo.ver','reportes.ver',
  'caja.ver','caja.cxc','inventario.ver','herramientas.ver','compras.ver','trabajadores.ver');

INSERT INTO Rol_Permiso (id_rol, codigo)
SELECT r.id_rol, p.codigo FROM Rol r JOIN Permiso p
WHERE r.codigo = 'ADMIN_FINANZAS' AND p.codigo IN
 ('dashboard.ver','clientes.ver','ordenes.ver_todas','catalogo.ver','caja.ver','caja.operar',
  'caja.supervisar','caja.cxc','inventario.ver','compras.ver','compras.pagar',
  'trabajadores.ver','trabajadores.editar');

INSERT INTO Rol_Permiso (id_rol, codigo)
SELECT r.id_rol, p.codigo FROM Rol r JOIN Permiso p
WHERE r.codigo = 'INVENTARIO' AND p.codigo IN
 ('ordenes.ver_todas','catalogo.ver','catalogo.recetas','inventario.ver','inventario.editar',
  'herramientas.ver','herramientas.editar','compras.ver','compras.editar');

INSERT INTO Rol_Permiso (id_rol, codigo)
SELECT r.id_rol, p.codigo FROM Rol r JOIN Permiso p
WHERE r.codigo = 'ASESOR' AND p.codigo IN
 ('dashboard.ver','clientes.ver','clientes.editar','agenda.ver','agenda.editar','ordenes.ver_todas',
  'ordenes.crear','ordenes.entregar','catalogo.ver','reportes.ver','caja.ver','caja.operar','inventario.ver');

INSERT INTO Rol_Permiso (id_rol, codigo)
SELECT r.id_rol, p.codigo FROM Rol r JOIN Permiso p
WHERE r.codigo = 'JEFE_TALLER' AND p.codigo IN
 ('dashboard.ver','clientes.ver','agenda.ver','ordenes.ver_todas','ordenes.crear','ordenes.avanzar',
  'catalogo.ver','reportes.ver','reportes.editar','inventario.ver','herramientas.ver','herramientas.editar',
  'compras.ver','trabajadores.ver');

INSERT INTO Rol_Permiso (id_rol, codigo)
SELECT r.id_rol, p.codigo FROM Rol r JOIN Permiso p
WHERE r.codigo = 'TECNICO' AND p.codigo IN
 ('ordenes.ver_propias','ordenes.avanzar','reportes.ver','reportes.editar','inventario.ver','herramientas.ver');

INSERT INTO Rol_Permiso (id_rol, codigo)
SELECT r.id_rol, p.codigo FROM Rol r JOIN Permiso p
WHERE r.codigo = 'SOPORTE' AND p.codigo IN ('usuarios.reset');

-- Usuario inicial (solo si la tabla está vacía). La contraseña se cifra sola en el primer login.
INSERT INTO usuario (name_user, passw, id_rol, debe_cambiar_clave)
SELECT 'admin', 'Admin2026', (SELECT id_rol FROM Rol WHERE codigo = 'GERENTE'), 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM usuario);
