-- El precio al que se publica el vehículo, que no es el mismo que el mínimo.
--
-- El mínimo es el piso: por debajo la agencia no cierra sin consultar al dueño.
-- El de publicación es la cifra que sale en el aviso y que ve el que consulta.
-- Entre los dos vive el margen de negociación, y es justo lo que el dueño
-- quiere saber antes de firmar: "lo publicás a cuánto y hasta dónde bajás".
-- Teniendo solo uno de los dos, esa conversación queda fuera del contrato.
--
-- Va NOT NULL como el mínimo: si se están pactando las condiciones, el precio
-- de publicación ya está decidido. Las filas que existan se completan con el
-- mínimo, que es el único valor que no inventa nada.
--
-- La regla "publicación >= mínimo" NO se pone como CHECK a propósito: se valida
-- en el servicio. Es una regla comercial, no una verdad estructural, y ahí se
-- cambia editando una línea en vez de migrando una restricción.
--
-- Rollback:
--   ALTER TABLE `consignacion_contratos`
--     DROP CHECK `consignacion_contratos_publicacion_valido`,
--     DROP COLUMN `precio_publicacion`;

ALTER TABLE `consignacion_contratos`
  ADD COLUMN `precio_publicacion` DECIMAL(12,2) NULL AFTER `precio_minimo`;

UPDATE `consignacion_contratos`
   SET `precio_publicacion` = `precio_minimo`
 WHERE `precio_publicacion` IS NULL;

ALTER TABLE `consignacion_contratos`
  MODIFY COLUMN `precio_publicacion` DECIMAL(12,2) NOT NULL;

ALTER TABLE `consignacion_contratos`
  ADD CONSTRAINT `consignacion_contratos_publicacion_valido` CHECK (`precio_publicacion` >= 0);
