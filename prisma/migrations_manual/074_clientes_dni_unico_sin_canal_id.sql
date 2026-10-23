-- Cierre de la fase 1 (una persona = una ficha). Se aplica DESPUÉS de unificar
-- las fichas repetidas con `scripts/unificar-clientes.js --aplicar`.
--
-- 1) El DNI no se repite entre clientes vigentes (las fichas archivadas con
--    `deleted_at` no cuentan). Índice funcional, mismo patrón que
--    `uq_usuarios_email_activo` (071): Prisma no lo ve.
--    El teléfono NO lleva índice único a propósito: una familia puede compartir
--    un número. Que la misma persona no quede dos veces por teléfono lo cuida
--    `resolverCliente` (services/clientes.service.js), la única puerta de alta.
-- 2) Sale `canal_id`: repetía el teléfono (web) o el DNI (presencial), y el
--    identificador de WhatsApp ya está en `cliente_canales` (073). Con él sale
--    el UNIQUE `uq_canal (canal, canal_id)`.
--
-- Son dos ALTER TABLE, uno por cambio y en ese orden. Entre los dos el estado es seguro: el
-- backend nuevo no escribe `canal_id` y el UNIQUE `uq_canal` admite NULL repetidos.
-- `DROP INDEX uq_canal` y `DROP COLUMN canal_id` van juntos, en el segundo: borrando solo la
-- columna, MySQL deja el UNIQUE reducido a `canal` y falla por duplicados. El esquema final es
-- el mismo que con un solo ALTER.
--
-- Chequeos previos: DESPUÉS de unificar y antes de aplicar. Los 1, 2, 3, 4 y 6 deben dar 0
-- (sin filas, o con el COUNT en 0); el 5 es informativo.
--   1) DNI repetido entre vigentes (rompería el índice único):
--        SELECT dni, COUNT(*) n FROM clientes WHERE deleted_at IS NULL AND dni IS NOT NULL GROUP BY dni HAVING n > 1;
--   2) Identificadores de mensajería que solo están en `canal_id`, sin vincular en `cliente_canales`
--      (los vacíos no cuentan, igual que en la copia de la 073):
--        SELECT COUNT(*) FROM clientes c WHERE c.canal IN ('whatsapp','facebook','instagram')
--          AND c.canal_id IS NOT NULL AND c.canal_id <> ''
--          AND NOT EXISTS (SELECT 1 FROM cliente_canales k WHERE k.canal = c.canal AND k.identificador = c.canal_id);
--   3) Fichas vigentes de mensajería cuyo `canal_id` ya figura en `cliente_canales` a nombre de OTRA
--      ficha. Si no se unen antes, la 074 les borra la única llave que las ata a ese WhatsApp,
--      Facebook o Instagram. `scripts/unificar-clientes.js` las une; si quedan, revisarlas a mano:
--        SELECT c.id, k.cliente_id FROM clientes c
--          JOIN cliente_canales k ON k.canal = c.canal AND k.identificador = c.canal_id
--          WHERE c.deleted_at IS NULL AND c.canal IN ('whatsapp','facebook','instagram') AND k.cliente_id <> c.id;
--   4) Dato que solo está en `canal_id`: fichas web con `telefono` vacío o presenciales con `dni`
--      vacío. Si hay, copiarlo antes a `telefono` o a `dni` (y repetir el chequeo 1: un DNI copiado
--      puede repetir el de otra ficha vigente):
--        SELECT id, canal, canal_id FROM clientes WHERE canal_id IS NOT NULL AND canal_id <> ''
--          AND ((canal = 'web' AND (telefono IS NULL OR telefono = ''))
--            OR (canal = 'presencial' AND (dni IS NULL OR dni = '')));
--   5) Informativo, puede dar filas: DNI vigentes que no son de 7 a 9 dígitos (pasaportes, "S/D",
--      vacío), para revisar a mano. Dos "S/D" vigentes romperían el índice (el chequeo 1 los ve):
--        SELECT id, dni FROM clientes WHERE deleted_at IS NULL AND dni IS NOT NULL AND dni NOT REGEXP '^[0-9]{7,9}$';
--   6) Filas hijas que siguen apuntando a una ficha archivada por fusión (`fusionado_en_id` no
--      nulo): la unificación las pasa a la ficha destino. Las columnas que apuntan a `clientes`
--      salen de las FK:
--        SELECT table_name, column_name FROM information_schema.KEY_COLUMN_USAGE
--          WHERE table_schema = DATABASE() AND referenced_table_name = 'clientes' AND referenced_column_name = 'id';
--      y para cada par (tabla, columna), salvo `cliente_fusiones` (el registro de las fusiones apunta
--      a las archivadas a propósito) y `clientes.fusionado_en_id`:
--        SELECT COUNT(*) FROM <tabla> h JOIN clientes c ON c.id = h.<columna> WHERE c.fusionado_en_id IS NOT NULL;
--
-- En producción: el backend nuevo tiene que estar desplegado (el viejo escribe
-- `canal_id` y fallaría) y el workflow viejo de n8n apagado.
--
-- Cómo aplicarla: igual que la 073 (a mano, con backup previo, todo en una sola sesión).
-- * Ensayarla antes en MySQL 8.4, la versión de producción (la base local es 9.5), con un volcado
--   de producción, y mirar qué ALGORITHM y LOCK usa cada ALTER. No forzar ALGORITHM ni LOCK.
-- * La primera sentencia, `SET SESSION lock_wait_timeout = 10`, limita a 10 segundos la espera por
--   el bloqueo de metadatos (el default es de un año, y un ALTER que lo espera frena toda la
--   tabla). Si vence (error 1205), reintentar.
-- * Sentencia por sentencia y, después de cada ALTER, `SHOW CREATE TABLE clientes`. El DDL confirma
--   solo: si el segundo ALTER falla, el primero ya quedó aplicado. Corregir la causa y correr SOLO
--   el segundo (volver a correr el primero falla por índice repetido).
--
-- Rollback. Si la unificación ya fusionó fichas, NO hay rollback por SQL: se restaura el volcado
-- previo a la unificación. El bloque de abajo devuelve la columna, pero no puede representar una
-- ficha `web` con un número de WhatsApp (el UPDATE que une con `cliente_canales` exige
-- `k.canal = c.canal`): esa ficha queda con `canal_id` = 'web-<id>' y el bot viejo no reconoce ese
-- número. Sin fusiones hechas, la columna vuelve con los datos que repetía:
--   ALTER TABLE `clientes` ADD COLUMN `canal_id` VARCHAR(120) NULL AFTER `canal`, DROP INDEX `uq_clientes_dni_vigente`;
--   UPDATE `clientes` c JOIN `cliente_canales` k ON k.cliente_id = c.id AND k.canal = c.canal SET c.canal_id = k.identificador;
--   UPDATE `clientes` SET `canal_id` = `dni` WHERE `canal` = 'presencial' AND `canal_id` IS NULL AND `deleted_at` IS NULL AND `dni` IS NOT NULL;
--   UPDATE `clientes` SET `canal_id` = CONCAT(`canal`, '-', `id`) WHERE `canal_id` IS NULL;
--   ALTER TABLE `clientes` ADD UNIQUE KEY `uq_canal` (`canal`, `canal_id`);
-- El UPDATE de las presenciales toca solo las vigentes con DNI: una archivada con el mismo DNI no
-- puede chocar con `uq_canal`. El resto (web, archivadas, presenciales sin DNI) se completa con el CONCAT.

SET SESSION lock_wait_timeout = 10;

-- 1) El DNI no se repite entre vigentes.
ALTER TABLE `clientes`
  ADD UNIQUE INDEX `uq_clientes_dni_vigente` ((IF(`deleted_at` IS NULL, `dni`, NULL)));

-- 2) Sale el UNIQUE viejo y, con él, la columna.
ALTER TABLE `clientes`
  DROP INDEX `uq_canal`,
  DROP COLUMN `canal_id`;
