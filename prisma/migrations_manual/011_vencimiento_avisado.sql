-- #5: marca de idempotencia para el aviso de vencimiento (Telegram + email).
-- Se setea (NOW()) cuando n8n ya notificó ese descuento/promoción vencida,
-- para no volver a avisar el mismo vencimiento en cada corrida del schedule.
-- Rollback:
--   ALTER TABLE descuentos   DROP COLUMN vencimiento_avisado_at;
--   ALTER TABLE promociones  DROP COLUMN vencimiento_avisado_at;

ALTER TABLE `descuentos`
  ADD COLUMN `vencimiento_avisado_at` DATETIME NULL AFTER `fecha_fin`;

ALTER TABLE `promociones`
  ADD COLUMN `vencimiento_avisado_at` DATETIME NULL AFTER `fecha_fin`;
