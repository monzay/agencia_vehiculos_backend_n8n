-- Las condiciones de una compra o una permuta: el boleto de compraventa (o el
-- contrato de permuta) y el compromiso de transferencia que la agencia le da al
-- vendedor.
--
-- Una sola tabla para las dos: una permuta es una compraventa donde parte del
-- precio se paga con un vehículo de la agencia. Las columnas `entregado_*` son
-- las de la permuta y quedan NULL en una compra; el servicio exige que estén
-- cuando el ingreso es una permuta.
--
-- Mismo circuito que `consignacion_contratos`: se edita libre hasta firmar, y
-- al firmar se congela `contrato_json` con todo lo que se imprime.
--
-- Lo que NO se guarda porque se deriva:
--   - la diferencia de la permuta (entregado_valor - precio);
--   - el saldo (monto a pagar - pago_en_acto);
--   - el vencimiento del compromiso (entrega_at + transferencia_dias).
--
-- `auto_entregado_id` apunta al stock de la agencia. Dominio, motor y chasis
-- del auto entregado van acá porque `autos` no tiene esas columnas: son los que
-- figuran en su título y se copian al boleto.
--
-- Rollback:
--   DROP TABLE `compraventa_contratos`;

CREATE TABLE IF NOT EXISTS compraventa_contratos (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ingreso_id            INT UNSIGNED NOT NULL,

  -- Lo que la agencia reconoce por el vehículo del cliente.
  precio                DECIMAL(12,2) NOT NULL,
  forma_pago            ENUM('transferencia','efectivo','cheque') NOT NULL DEFAULT 'transferencia',
  -- Lo que se paga al firmar; el resto es saldo y necesita fecha.
  pago_en_acto          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  saldo_fecha           DATE NULL,

  -- Permuta: el vehículo que la agencia entrega como parte de pago.
  auto_entregado_id     INT UNSIGNED NULL,
  entregado_dominio     VARCHAR(15) NULL,
  entregado_motor       VARCHAR(40) NULL,
  entregado_chasis      VARCHAR(40) NULL,
  entregado_valor       DECIMAL(12,2) NULL,

  -- El momento exacto de la entrega: corta la responsabilidad civil, penal y
  -- administrativa del vendedor, y desde ahí corre el compromiso.
  entrega_at            DATETIME NOT NULL,
  transferencia_dias    SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  gastos_transferencia  ENUM('agencia','cliente') NOT NULL DEFAULT 'agencia',

  estado_unidad         TEXT NULL,
  condiciones           TEXT NULL,
  -- Ciudad de los tribunales. NULL = los del domicilio de la agencia.
  jurisdiccion          VARCHAR(120) NULL,

  firmado_at            DATETIME NULL,
  contrato_json         JSON NULL,

  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at            DATETIME NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_ingreso (ingreso_id),

  CONSTRAINT compraventa_contratos_precio_valido CHECK (precio > 0 AND pago_en_acto >= 0),
  CONSTRAINT compraventa_contratos_plazo_valido CHECK (transferencia_dias BETWEEN 1 AND 365),
  -- El auto entregado y su valor van juntos: o es permuta, o no.
  CONSTRAINT compraventa_contratos_permuta_completa CHECK ((auto_entregado_id IS NULL) = (entregado_valor IS NULL)),
  -- Firma y copia congelada van juntas, como en consignacion_contratos.
  CONSTRAINT compraventa_contratos_firma_con_copia CHECK ((firmado_at IS NULL) = (contrato_json IS NULL)),

  CONSTRAINT compraventa_contratos_ingreso_fk FOREIGN KEY (ingreso_id)
    REFERENCES consignacion_ingresos (id) ON DELETE CASCADE ON UPDATE CASCADE,
  -- RESTRICT en los dos sentidos: MySQL no admite un CHECK sobre una columna con
  -- acción en cascada (el de permuta completa, acá arriba).
  CONSTRAINT compraventa_contratos_auto_fk FOREIGN KEY (auto_entregado_id)
    REFERENCES autos (id) ON DELETE RESTRICT ON UPDATE RESTRICT,

  INDEX idx_auto_entregado (auto_entregado_id)
);
