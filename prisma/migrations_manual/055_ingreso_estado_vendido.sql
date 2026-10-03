-- El ingreso de una consignación puede terminar vendido.
--
-- Hasta ahora el ingreso quedaba "publicado" aunque el auto se vendiera desde
-- Vehículos, y Documentos mostraba a la venta un auto que ya no estaba. La venta
-- la marca Vehículos (autos.vendido_at); este estado la refleja en Documentos.
--
-- El valor se agrega al final del ENUM: no reescribe la tabla ni mueve los que
-- ya estaban. Después se pasan a "vendido" los ingresos publicados cuyo auto ya
-- figura vendido, para que los datos de antes queden coherentes.
--
-- Rollback (solo si ninguna fila lo usa):
--   UPDATE consignacion_ingresos SET estado = 'publicado' WHERE estado = 'vendido';
--   ALTER TABLE consignacion_ingresos MODIFY estado ENUM('recepcion','publicado','retirado') NOT NULL DEFAULT 'recepcion';

ALTER TABLE `consignacion_ingresos`
  MODIFY `estado` ENUM('recepcion','publicado','retirado','vendido') NOT NULL DEFAULT 'recepcion';

UPDATE `consignacion_ingresos` i
  JOIN `consignaciones` c ON c.id = i.consignacion_id
  JOIN `autos` a ON a.id = c.auto_id
   SET i.estado = 'vendido', i.estado_at = a.vendido_at
 WHERE i.deleted_at IS NULL
   AND i.estado = 'publicado'
   AND a.vendido_at IS NOT NULL;
