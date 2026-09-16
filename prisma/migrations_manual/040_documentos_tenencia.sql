-- Cargar un papel no es tenerlo.
--
-- Hasta acá, que un documento existiera en la tabla solo probaba que alguien le
-- sacó una foto. El papel físico podía estar en la carpeta, podía ser una
-- fotocopia, o podía no haber llegado nunca (el cliente manda la foto del título
-- por WhatsApp y el original sigue en su casa). Los tres casos se veían iguales:
-- "Cargado". Eso es exactamente lo que no se puede confundir cuando llega el
-- momento de transferir.
--
--   no_recibido -> solo está la imagen. El papel no está en la agencia.
--   copia       -> hay una fotocopia en la carpeta, el original lo tiene el dueño.
--   original    -> el papel original está en la agencia.
--
-- El default es `no_recibido` a propósito: subir una imagen no prueba tenencia,
-- y dar por hecho que sí es justo el error que esta columna viene a evitar. Por
-- la misma razón las filas que ya existen NO se adivinan: quedan todas en
-- `no_recibido` y se corrigen a mano, que es la única forma honesta de saberlo.
--
-- `ubicacion_fisica` deja de ser texto suelto y pasa a ser obligatorio cuando la
-- agencia sí tiene el papel: si está acá, tiene que decir dónde.
--
-- Distinto de `destino` del catálogo (lib/documentos-catalogo.js), que dice lo
-- que se ESPERA de cada tipo. Esta columna dice lo que PASÓ con este papel.
--
-- Rollback:
--   ALTER TABLE `consignacion_documentos`
--     DROP CHECK `consignacion_documentos_ubicacion_valida`,
--     DROP COLUMN `tenencia`,
--     DROP INDEX `idx_tenencia`;

ALTER TABLE `consignacion_documentos`
  ADD COLUMN `tenencia` ENUM('no_recibido','copia','original') NOT NULL DEFAULT 'no_recibido'
    AFTER `tipo`,
  ADD CONSTRAINT `consignacion_documentos_ubicacion_valida` CHECK (
    `tenencia` = 'no_recibido' OR `ubicacion_fisica` IS NOT NULL
  ),
  -- Para responder "qué originales tengo" sin recorrer todos los ingresos.
  ADD KEY `idx_tenencia` (`deleted_at`, `tenencia`);
