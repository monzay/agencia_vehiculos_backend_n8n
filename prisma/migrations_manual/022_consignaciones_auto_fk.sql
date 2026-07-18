-- El vehículo de una consignación se elige del catálogo (`autos`), no se tipea.
-- Antes se copiaban marca/modelo/año/kms adentro de `consignaciones`: eso
-- duplicaba el dato y lo dejaba desincronizado si se corregía el auto.
--
-- Ahora la consignación apunta al auto por FK. La patente se queda acá porque
-- `autos` no la tiene.
--
-- Se puede correr sobre la tabla vacía: no hay filas que migrar.

-- El CHECK vive sobre `anio`, así que se va antes que la columna.
ALTER TABLE consignaciones DROP CHECK consignaciones_anio_valido;

ALTER TABLE consignaciones
  DROP COLUMN marca,
  DROP COLUMN modelo,
  DROP COLUMN anio,
  DROP COLUMN kms;

ALTER TABLE consignaciones
  ADD COLUMN auto_id INT UNSIGNED NOT NULL AFTER id,
  ADD CONSTRAINT consignaciones_auto_fk FOREIGN KEY (auto_id) REFERENCES autos(id),
  ADD INDEX idx_auto (auto_id);
