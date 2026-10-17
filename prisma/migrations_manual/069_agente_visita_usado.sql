-- Objetivo del agente vendedor: calificar completo y cerrar con una visita.
--
-- 1) `vehiculo_cliente.detalles`: estado del usado que el cliente entrega como
--    parte de pago (choques, service, cubiertas, algo para arreglar). Los km y
--    el precio pedido ya tenían columna. Si el cliente no sabe cuánto pedir,
--    `precio_pedido` guarda "No sabe".
--
-- 2) `sesiones.visita_propuesta`: el día y la franja que el cliente dijo para
--    pegarse una vuelta a ver el auto ("sábado a la mañana"). No es un turno
--    confirmado: el vendedor lo ve en el panel para esperarlo con el auto listo.
--
-- 3) Permisos del usuario del agente (067): ahora puede completar km, detalles y
--    precio del usado, y la visita propuesta. Nada más.
--
-- Columnas nuevas y nulas: no toca filas existentes.
--
-- Rollback:
--   REVOKE UPDATE (`kms`, `precio_pedido`, `detalles`) ON `agencia`.`vehiculo_cliente` FROM 'agente_ia'@'%';
--   REVOKE UPDATE (`visita_propuesta`, `visita_propuesta_at`) ON `agencia`.`sesiones` FROM 'agente_ia'@'%';
--   ALTER TABLE `sesiones` DROP COLUMN `visita_propuesta_at`, DROP COLUMN `visita_propuesta`;
--   ALTER TABLE `vehiculo_cliente` DROP COLUMN `detalles`;

ALTER TABLE `vehiculo_cliente`
  ADD COLUMN `detalles` VARCHAR(300) NULL AFTER `precio_pedido`;

ALTER TABLE `sesiones`
  ADD COLUMN `visita_propuesta`    VARCHAR(120) NULL AFTER `disponibilidad`,
  ADD COLUMN `visita_propuesta_at` DATETIME     NULL AFTER `visita_propuesta`;

GRANT UPDATE (`kms`, `precio_pedido`, `detalles`) ON `agencia`.`vehiculo_cliente` TO 'agente_ia'@'%';
GRANT UPDATE (`visita_propuesta`, `visita_propuesta_at`) ON `agencia`.`sesiones` TO 'agente_ia'@'%';
