-- Fase 2 de normalización: quitar `chat_estado.auto_ref` (redundante con auto_id).
-- `auto_ref` era una dependencia transitiva de `auto_id` (ref es atributo único
-- de autos). Primero se rellena auto_id desde auto_ref (por si faltaba), luego se
-- elimina la columna. La ref se deriva por JOIN a `autos` donde haga falta.
--
-- Rollback:
--   ALTER TABLE chat_estado ADD COLUMN auto_ref VARCHAR(30) NULL;
--   UPDATE chat_estado ce JOIN autos a ON a.id=ce.auto_id SET ce.auto_ref=a.ref;

UPDATE `chat_estado` ce
  JOIN `autos` a ON a.ref = ce.auto_ref
  SET ce.auto_id = a.id
  WHERE ce.auto_id IS NULL AND ce.auto_ref IS NOT NULL;

ALTER TABLE `chat_estado` DROP COLUMN `auto_ref`;
