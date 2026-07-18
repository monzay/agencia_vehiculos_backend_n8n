-- Marca de última revisión de la sección Financiación por usuario, para el badge
-- de novedades del panel: cuántos clientes tienen una cuota venciendo HOY que
-- sigue pendiente. Mismo mecanismo que `consultas_visto_at` / `ventas_visto_at`.
--
-- Rollback:
--   ALTER TABLE `usuarios` DROP COLUMN `financiacion_visto_at`;

ALTER TABLE `usuarios`
  ADD COLUMN `financiacion_visto_at` DATETIME NULL AFTER `ventas_visto_at`;
