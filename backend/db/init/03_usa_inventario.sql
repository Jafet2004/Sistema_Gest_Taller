-- Permite que cada servicio de una orden use (o no) repuestos/insumos del inventario.
-- usa_inventario = 1 -> precio completo + receta del servicio (comportamiento anterior)
-- usa_inventario = 0 -> el cliente trae las piezas: solo se cobra mano de obra, sin tocar stock
ALTER TABLE Orden_Servicio_Detalle
  ADD COLUMN usa_inventario TINYINT(1) NOT NULL DEFAULT 1 AFTER precio;
