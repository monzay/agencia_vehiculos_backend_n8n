-- Fase 1 de normalización: autos a 1NF.
-- `autos.descripcion` guardaba dos hechos juntos ("Auto · gnc" = tipo + combustible).
-- Se agregan columnas atómicas y se hace backfill parseando `descripcion`.
-- `descripcion` NO se elimina todavía (el bot n8n aún la lee) → se dropea en la Fase 5.
--
-- Rollback:
--   ALTER TABLE autos DROP COLUMN tipo_vehiculo, DROP COLUMN combustible;

ALTER TABLE `autos`
  ADD COLUMN `tipo_vehiculo` VARCHAR(10) NULL AFTER `tipo`,
  ADD COLUMN `combustible`   VARCHAR(10) NULL AFTER `tipo_vehiculo`;

-- Backfill desde la descripción compuesta.
UPDATE `autos` SET
  `tipo_vehiculo` = CASE
     WHEN LOWER(TRIM(SUBSTRING_INDEX(descripcion, '·', 1))) LIKE 'moto%' THEN 'moto'
     ELSE 'auto'
   END,
  `combustible` = CASE
     WHEN LOWER(descripcion) LIKE '%gnc%'    THEN 'gnc'
     WHEN LOWER(descripcion) LIKE '%nafta%'  THEN 'nafta'
     WHEN LOWER(descripcion) LIKE '%diesel%' THEN 'diesel'
     ELSE NULL
   END
WHERE descripcion IS NOT NULL;
