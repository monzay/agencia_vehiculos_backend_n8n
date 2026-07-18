-- Marca de última revisión de la sección Descuentos por usuario, para el badge de
-- novedades del panel: cuántos descuentos/promos vencieron desde la última vez que
-- el usuario la abrió. Mismo mecanismo que `consultas_visto_at` / `ventas_visto_at`.
--
-- Rollback:
--   ALTER TABLE `usuarios` DROP COLUMN `descuentos_visto_at`;

ALTER TABLE `usuarios`
  ADD COLUMN `descuentos_visto_at` DATETIME NULL AFTER `financiacion_visto_at`;
