-- Vehículos que la agencia tomó en consignación: los exhibe y los vende por
-- cuenta del dueño, cobrando una comisión.
--
-- No se reusa `autos` porque el vehículo no es de la agencia (no entra al
-- catálogo con precio propio), ni `clientes`, porque el consignante puede no
-- haber pasado nunca por el bot (`clientes` exige canal + canal_id de WhatsApp).
-- Por eso los datos del dueño viven acá: es un contacto del registro, no un lead.
--
-- Relación con el bot: una consulta con `sesiones.modalidad_venta='consignacion'`
-- es una INTENCIÓN; esta tabla es el acuerdo ya cerrado. Son cosas distintas.
CREATE TABLE IF NOT EXISTS consignaciones (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,

  marca           VARCHAR(60)  NOT NULL,
  modelo          VARCHAR(80)  NOT NULL,
  anio            SMALLINT UNSIGNED NOT NULL,
  kms             INT UNSIGNED NULL,
  patente         VARCHAR(15)  NULL,

  duenio_nombre   VARCHAR(120) NOT NULL,
  duenio_telefono VARCHAR(30)  NULL,

  -- Precio que se pactó con el dueño y comisión de la agencia, en porcentaje.
  precio_pactado  DECIMAL(12,2) NOT NULL,
  comision        DECIMAL(5,2)  NOT NULL DEFAULT 0,

  estado          ENUM('en_venta','vendido','retirado') NOT NULL DEFAULT 'en_venta',
  notas           TEXT NULL,

  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Soft delete, como el resto de las tablas de negocio.
  deleted_at      DATETIME NULL,

  PRIMARY KEY (id),
  CONSTRAINT consignaciones_comision_valida CHECK (comision BETWEEN 0 AND 100),
  CONSTRAINT consignaciones_precio_valido   CHECK (precio_pactado >= 0),
  CONSTRAINT consignaciones_anio_valido     CHECK (anio BETWEEN 1900 AND 2200),

  INDEX idx_estado (estado),
  INDEX idx_vigentes (deleted_at, estado)
);
