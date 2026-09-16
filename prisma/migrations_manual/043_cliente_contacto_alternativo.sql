-- Un teléfono alternativo para ubicar al cliente, y de quién es.
--
-- Reemplaza, en el alta de la consignación, la carga del cónyuge. La necesidad
-- práctica era poder comunicarse con alguien cercano si el dueño no atiende;
-- para eso alcanza con un número y el vínculo, sin cargar a una segunda persona
-- entera con su DNI, domicilio y CUIT.
--
-- Va en `cliente_perfiles` y no en el ingreso porque es un dato de la PERSONA:
-- si el mismo cliente trae un segundo auto, su contacto alternativo es el mismo.
--
-- Es uno solo a propósito. Si algún día hacen falta varios, eso es una tabla
-- `cliente_contactos` aparte; hoy sería estructura para un caso que no existe.
--
-- Teléfono y vínculo van juntos: un número sin saber de quién es no sirve para
-- llamar ("¿hablo con…?"), y un vínculo sin número no tiene uso.
--
-- Rollback:
--   ALTER TABLE `cliente_perfiles`
--     DROP CHECK `cliente_perfiles_contacto_alt_valido`,
--     DROP COLUMN `contacto_alt_vinculo`,
--     DROP COLUMN `contacto_alt_telefono`;

ALTER TABLE `cliente_perfiles`
  ADD COLUMN `contacto_alt_telefono` VARCHAR(30) NULL AFTER `alias_cbu`,
  ADD COLUMN `contacto_alt_vinculo`
    ENUM('pareja','padre_madre','hermano_a','hijo_a','otro') NULL AFTER `contacto_alt_telefono`,
  ADD CONSTRAINT `cliente_perfiles_contacto_alt_valido` CHECK (
    (`contacto_alt_telefono` IS NULL AND `contacto_alt_vinculo` IS NULL)
    OR (`contacto_alt_telefono` IS NOT NULL AND `contacto_alt_vinculo` IS NOT NULL)
  );
