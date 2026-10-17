-- Reglas de integridad que hasta ahora cuidaba solo el código (revisión de
-- normalización del 16/10/2026) y la relación entrega → cliente.
--
-- 1) `autos`: un auto vendido no puede estar disponible, y solo un auto vendido
--    tiene precio de venta (el cierre real).
-- 2) `senas`: si tiene el trámite al que se convirtió, figura "convertida".
-- 3) `usuarios`: el email no se repite entre usuarios activos (los borrados con
--    `deleted_at` no cuentan). Índice funcional: Prisma no lo ve, el código ya
--    lo valida antes (`chequearEmailLibre`); esto cubre dos altas simultáneas.
-- 4) `entregas` (fotos de la galería del home): cada entrega es la de un
--    cliente. Las fotos cargadas antes no tienen cliente: se archivan
--    (`deleted_at`, borrado lógico) y la regla exige cliente solo a las vigentes.
--
-- Antes de cada regla se corrigen los datos que la romperían (en producción son
-- de prueba; decisión del usuario del 16/10/2026).
--
-- En producción: aplicar después de 057-070 y desplegar el backend nuevo en la
-- misma ventana (el viejo crea entregas sin cliente y el CHECK las rechaza).
-- El DDL de MySQL no es transaccional: correr antes estos chequeos y que den 0:
--   SELECT email, COUNT(*) n FROM usuarios WHERE deleted_at IS NULL GROUP BY email HAVING n > 1;
--   SELECT COUNT(*) FROM senas WHERE ingreso_id IS NOT NULL AND estado <> 'convertida';
-- Efecto visible: las fotos de entregas que ya existen (sin cliente) se
-- archivan y salen de la galería del home hasta volver a cargarlas con su cliente.
--
-- Rollback:
--   ALTER TABLE `entregas` DROP CHECK `chk_entrega_vigente_con_cliente`, DROP FOREIGN KEY `entregas_cliente_fk`, DROP INDEX `idx_entrega_cliente`, DROP COLUMN `cliente_id`;
--   ALTER TABLE `usuarios` DROP INDEX `uq_usuarios_email_activo`;
--   ALTER TABLE `senas` DROP CHECK `chk_sena_convertida_con_tramite`;
--   ALTER TABLE `autos` DROP CHECK `chk_auto_vendido_no_disponible`, DROP CHECK `chk_auto_precio_venta_vendido`;

-- 1) Autos
UPDATE `autos` SET `disponible` = 0 WHERE `vendido_at` IS NOT NULL AND `disponible` = 1;
UPDATE `autos` SET `precio_venta` = NULL WHERE `precio_venta` IS NOT NULL AND `vendido_at` IS NULL;
ALTER TABLE `autos`
  ADD CONSTRAINT `chk_auto_vendido_no_disponible` CHECK (`vendido_at` IS NULL OR `disponible` = 0),
  ADD CONSTRAINT `chk_auto_precio_venta_vendido` CHECK (`precio_venta` IS NULL OR `vendido_at` IS NOT NULL);

-- 2) Señas: con trámite ⇒ convertida. Al revés no: una seña también se
--    convierte sin trámite cuando el auto se marca vendido (062, `cerrarVenta`).
UPDATE `senas` SET `estado` = 'convertida', `estado_at` = NOW() WHERE `estado` <> 'convertida' AND `ingreso_id` IS NOT NULL;
ALTER TABLE `senas`
  ADD CONSTRAINT `chk_sena_convertida_con_tramite` CHECK (`ingreso_id` IS NULL OR `estado` = 'convertida');

-- 3) Usuarios: si hubiera emails repetidos entre activos, queda el más nuevo.
UPDATE `usuarios` u
  JOIN `usuarios` otro ON otro.`email` = u.`email` AND otro.`deleted_at` IS NULL AND otro.`id` > u.`id`
  SET u.`deleted_at` = NOW(), u.`activo` = 0
  WHERE u.`deleted_at` IS NULL AND u.`admin_unico` IS NULL;
ALTER TABLE `usuarios`
  ADD UNIQUE INDEX `uq_usuarios_email_activo` ((IF(`deleted_at` IS NULL, `email`, NULL)));

-- 4) Entregas → clientes
ALTER TABLE `entregas`
  ADD COLUMN `cliente_id` INT UNSIGNED NULL AFTER `url`,
  ADD KEY `idx_entrega_cliente` (`cliente_id`),
  ADD CONSTRAINT `entregas_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
UPDATE `entregas` SET `deleted_at` = NOW() WHERE `cliente_id` IS NULL AND `deleted_at` IS NULL;
ALTER TABLE `entregas`
  ADD CONSTRAINT `chk_entrega_vigente_con_cliente` CHECK (`cliente_id` IS NOT NULL OR `deleted_at` IS NOT NULL);
