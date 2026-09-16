-- Datos fiscales y bancarios del cliente. Extensión 1:1 de `clientes`.
--
-- Una consignación necesita saber a quién liquidarle y contra qué documento:
-- CUIT, domicilio y CBU. Nada de eso existe en `clientes`, que fue pensada para
-- un lead del bot (nombre, teléfono, DNI, email).
--
-- Va en tabla aparte y no como columnas nuevas en `clientes` por dos razones:
--   1. Solo una minoría de clientes llega a tener estos datos. Sumarlos a
--      `clientes` dejaría seis columnas NULL en cada lead que escribe "hola".
--   2. Es la información más sensible que guarda el sistema (CUIT + CBU).
--      Separada, se le puede restringir el acceso sin tocar el resto.
--
-- El vínculo es `cliente_id` UNIQUE: un cliente tiene a lo sumo un perfil, y
-- el perfil no existe sin su cliente (ON DELETE CASCADE).
--
-- `apellido` está acá y no en `clientes` a propósito: el bot pisa
-- `clientes.nombre` con lo que manda WhatsApp, que suele venir todo junto y sin
-- normalizar. El apellido cargado a mano en el panel no puede depender de eso.
--
-- Rollback:
--   DROP TABLE `cliente_perfiles`;

CREATE TABLE IF NOT EXISTS cliente_perfiles (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id  INT UNSIGNED NOT NULL,

  apellido    VARCHAR(120) NULL,
  -- Sin guiones: 11 dígitos. Se formatea al mostrarlo.
  cuit        VARCHAR(11)  NULL,

  domicilio   VARCHAR(200) NULL,
  localidad   VARCHAR(120) NULL,
  provincia   VARCHAR(80)  NULL,

  -- Para liquidarle cuando se venda. El CBU son 22 dígitos exactos; el alias
  -- es la alternativa que la mayoría de la gente tiene a mano.
  cbu         VARCHAR(22)  NULL,
  alias_cbu   VARCHAR(40)  NULL,

  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_cliente (cliente_id),

  CONSTRAINT cliente_perfiles_cuit_valido CHECK (cuit IS NULL OR cuit REGEXP '^[0-9]{11}$'),
  CONSTRAINT cliente_perfiles_cbu_valido  CHECK (cbu  IS NULL OR cbu  REGEXP '^[0-9]{22}$'),

  CONSTRAINT cliente_perfiles_cliente_fk FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE CASCADE ON UPDATE CASCADE
);
