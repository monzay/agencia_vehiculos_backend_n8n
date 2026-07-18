-- Migración manual: marcar una consulta (sesión) como ATENDIDA.
--
-- Asesores y admin pueden marcar/desmarcar una consulta como atendida desde el
-- panel. Se guarda cuándo (atendido_at) y quién (atendido_por = nombre de la
-- cuenta que la marcó, como snapshot de auditoría).
--
-- Rollback:
--   ALTER TABLE `sesiones` DROP COLUMN `atendido_at`;
--   ALTER TABLE `sesiones` DROP COLUMN `atendido_por`;

ALTER TABLE `sesiones`
  ADD COLUMN `atendido_at`  DATETIME     NULL AFTER `bot_pausado`,
  ADD COLUMN `atendido_por` VARCHAR(120) NULL AFTER `atendido_at`;
