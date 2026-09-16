-- La toma del vehículo: el momento en que el auto entra al playón.
--
-- `consignaciones` no sirve para esto porque exige `auto_id`, y el auto todavía
-- no está publicado: primero se recibe, se peritalla y se juntan los papeles, y
-- recién cuando está todo en orden se carga al catálogo. Esta tabla cubre esa
-- etapa previa, que hoy no existía en ningún lado.
--
-- Cuando el auto se publica, `consignacion_id` apunta a la fila de
-- `consignaciones` y ahí arranca la parte comercial. Por eso `estado` acá NO
-- repite 'en_venta' ni 'vendido': esos hechos viven en `consignaciones` y tener
-- dos columnas diciendo lo mismo es garantía de que un día se contradigan.
--
-- Los datos del vehículo son propios y no copiados del catálogo: son LA VERDAD
-- del auto, la que el operador confirma. Lo que declara cada papel se guarda
-- aparte, en `consignacion_documentos`, justamente para poder compararlos.
--
-- El titular y el cónyuge son filas de `clientes` (canal='presencial' para los
-- de mostrador). No se duplican nombres acá: el vínculo es por id.
--
-- Rollback:
--   DROP TABLE `consignacion_ingresos`;

CREATE TABLE IF NOT EXISTS consignacion_ingresos (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- Quién deja el auto. El cónyuge se pide porque el título puede ser ganancial
  -- y su DNI es parte de la documentación obligatoria.
  cliente_id         INT UNSIGNED NOT NULL,
  conyuge_cliente_id INT UNSIGNED NULL,

  -- NULL hasta que el auto se publica en el catálogo.
  consignacion_id    INT UNSIGNED NULL,

  dominio            VARCHAR(15)  NOT NULL,
  marca              VARCHAR(60)  NOT NULL,
  modelo             VARCHAR(80)  NOT NULL,
  anio               SMALLINT UNSIGNED NOT NULL,
  -- Se completan al cargar el título; al recibir el auto pueden no estar.
  motor              VARCHAR(40)  NULL,
  chasis             VARCHAR(40)  NULL,
  origen             ENUM('nacional','importado') NULL,

  -- Kilómetros con los que entró. Queda congelado: es lo que se firma en el
  -- recibo de recepción y contra eso se reclama después.
  km_recepcion       INT UNSIGNED NULL,

  estado             ENUM('recepcion','publicado','retirado') NOT NULL DEFAULT 'recepcion',

  recibido_por       INT UNSIGNED NULL,
  recibido_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notas              TEXT NULL,

  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at         DATETIME NULL,

  PRIMARY KEY (id),
  -- Un auto publicado sale de una sola toma. MySQL admite varios NULL en un
  -- índice único, así que los ingresos sin publicar no se estorban.
  UNIQUE KEY uq_consignacion (consignacion_id),

  CONSTRAINT consignacion_ingresos_anio_valido CHECK (anio BETWEEN 1900 AND 2200),
  CONSTRAINT consignacion_ingresos_conyuge_distinto
    CHECK (conyuge_cliente_id IS NULL OR conyuge_cliente_id <> cliente_id),

  -- Sin acción referencial a propósito: `clientes.id` es autoincremental y no
  -- cambia nunca, y MySQL no admite un CHECK sobre una columna que participe de
  -- un ON UPDATE/DELETE en cascada (el de cónyuge distinto, acá arriba).
  CONSTRAINT consignacion_ingresos_cliente_fk FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT consignacion_ingresos_conyuge_fk FOREIGN KEY (conyuge_cliente_id)
    REFERENCES clientes (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT consignacion_ingresos_consignacion_fk FOREIGN KEY (consignacion_id)
    REFERENCES consignaciones (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT consignacion_ingresos_usuario_fk FOREIGN KEY (recibido_por)
    REFERENCES usuarios (id) ON DELETE SET NULL ON UPDATE CASCADE,

  INDEX idx_vigentes (deleted_at, estado),
  INDEX idx_cliente (cliente_id),
  INDEX idx_dominio (dominio)
);
