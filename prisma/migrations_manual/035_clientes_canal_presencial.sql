-- Un consignante puede llegar caminando al playón sin haber escrito nunca.
--
-- `clientes.canal` solo contemplaba orígenes digitales, así que una persona de
-- mostrador había que disfrazarla de 'web'. Eso ensucia dos cosas: las métricas
-- por canal (un walk-in contaba como tráfico web) y la deduplicación, porque el
-- unique es (canal, canal_id) y la misma persona terminaba dos veces.
--
-- 'presencial' la nombra por lo que es. Su `canal_id` es el DNI normalizado:
-- el único identificador que esa persona trae consigo.
--
-- Agregar un valor al final de un ENUM no reescribe la tabla ni toca las filas
-- existentes: los cuatro valores previos conservan su posición.
--
-- Rollback (solo si ninguna fila lo usa):
--   ALTER TABLE `clientes` MODIFY `canal`
--     ENUM('whatsapp','facebook','instagram','web') NOT NULL;

ALTER TABLE `clientes`
  MODIFY `canal` ENUM('whatsapp','facebook','instagram','web','presencial') NOT NULL;
