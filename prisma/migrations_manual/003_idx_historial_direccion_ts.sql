-- Migración manual: índice para el feed de "Consultas" del panel.
--
-- La query `SELECT ... FROM historial_mensajes WHERE direccion='entrante'
-- ORDER BY created_at DESC LIMIT N` hacía Table scan + filesort. Este índice
-- compuesto (igualdad `direccion` + orden `created_at`) la resuelve como range
-- scan sin filesort. Importa a medida que crece historial_mensajes.
--
-- SEGURO para el flujo del bot: es puramente ADITIVO (online DDL, sin bloqueo),
-- no cambia ninguna columna/tabla/tipo, así que no afecta el SQL crudo de n8n.
--
-- Aplicar: cd web/backend && npm run prisma:pull && npm run prisma:generate
-- Rollback:  ALTER TABLE historial_mensajes DROP INDEX idx_direccion_ts;

ALTER TABLE `historial_mensajes`
  ADD INDEX `idx_direccion_ts` (`direccion`, `created_at`),
  ALGORITHM=INPLACE, LOCK=NONE;
