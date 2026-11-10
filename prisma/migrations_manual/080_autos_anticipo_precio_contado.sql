-- Anticipo y precio al contado de cada auto, para publicarlos en la ficha.
--
--   precio         -> la columna no cambia; desde ahora se carga el financiado o de permuta.
--   precio_contado -> lo que sale si se paga de contado. El boleto de una venta
--                     al contado arranca con él.
--   anticipo       -> el anticipo que se publica. No es el que ofrece un cliente:
--                     ese se guarda en su consulta.
--
-- Los dos son NULL: son opcionales y los autos ya cargados no los tienen.
-- El usuario `agente_ia` no recibe permiso: el bot todavía no usa estos datos.
--
-- Orden al desplegar: primero esta migración y después el backend, que lee estas
-- columnas en cada consulta de autos.
--
-- Rollback: volver primero al backend anterior. Borra lo que se haya cargado.
--   ALTER TABLE `autos` DROP COLUMN `anticipo`, DROP COLUMN `precio_contado`, ALGORITHM=INSTANT;

ALTER TABLE `autos`
  ADD COLUMN `precio_contado` DECIMAL(12,2) NULL AFTER `precio`,
  ADD COLUMN `anticipo`       DECIMAL(12,2) NULL AFTER `precio_contado`,
  ALGORITHM=INSTANT;
