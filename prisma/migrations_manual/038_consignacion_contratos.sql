-- Las condiciones firmadas de una consignación. 1:1 con el ingreso.
--
-- No hay formulario oficial de consignación: cada agencia arma el suyo. Lo que
-- sí es fijo es la lista de puntos que, si faltan, terminan en discusión: a
-- cuánto puede vender, cuánto cobra la agencia, hasta cuándo, quién paga qué y
-- en cuántos días le liquidan. Esta tabla es esa lista, y de acá sale el PDF.
--
-- Va aparte de `consignacion_ingresos` porque son dos hechos con vidas
-- distintas: el auto se recibe siempre, el contrato se firma después y puede
-- renegociarse. Además el ingreso lo mira todo el panel, y las condiciones
-- comerciales no tienen por qué viajar en cada listado.
--
-- `contrato_json` congela lo firmado. Si mañana cambian los valores por defecto
-- de la agencia o se corrige una columna, el contrato ya impreso no se mueve:
-- el papel que tiene el cliente en la mano y lo que dice el sistema siguen
-- diciendo lo mismo. Es NULL hasta que se firma.
--
-- Los papeles entregados NO se listan acá: viven en `consignacion_documentos`
-- y el recibo se arma leyendo esa tabla. Copiarlos sería tener dos verdades.
--
-- Rollback:
--   DROP TABLE `consignacion_contratos`;

CREATE TABLE IF NOT EXISTS consignacion_contratos (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ingreso_id            INT UNSIGNED NOT NULL,

  -- Por debajo de esto la agencia no puede cerrar sin consultar al dueño.
  precio_minimo         DECIMAL(12,2) NOT NULL,

  -- Puede pactarse como porcentaje o como monto fijo; las dos formas se usan.
  comision_tipo         ENUM('porcentaje','monto') NOT NULL DEFAULT 'porcentaje',
  comision_valor        DECIMAL(12,2) NOT NULL DEFAULT 0,
  -- TRUE  = sale del precio (el dueño cobra precio menos comisión).
  -- FALSE = se suma por encima (el dueño cobra el precio completo).
  comision_incluida     BOOLEAN NOT NULL DEFAULT TRUE,

  -- Cuánto tiempo la agencia tiene la unidad, desde la firma.
  plazo_dias            SMALLINT UNSIGNED NOT NULL DEFAULT 90,

  -- Quién paga cada gasto. Son cuatro columnas y no un JSON porque la lista es
  -- cerrada y cada una se imprime como una cláusula del contrato.
  gastos_verificacion   ENUM('agencia','cliente') NOT NULL DEFAULT 'cliente',
  gastos_libre_deuda    ENUM('agencia','cliente') NOT NULL DEFAULT 'cliente',
  gastos_lavado         ENUM('agencia','cliente') NOT NULL DEFAULT 'agencia',
  gastos_publicacion    ENUM('agencia','cliente') NOT NULL DEFAULT 'agencia',

  -- Si el dueño se arrepiente antes del plazo.
  retiro_aviso_dias     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  retiro_costo          DECIMAL(12,2)     NOT NULL DEFAULT 0,

  -- Chapa, faltantes y todo lo que no sean los km (esos están en el ingreso,
  -- que es donde se firma el recibo de recepción).
  estado_unidad         TEXT NULL,

  -- Si la agencia puede sacar el auto a probar y quién responde ante un choque.
  prueba_manejo         BOOLEAN NOT NULL DEFAULT FALSE,
  prueba_responsable    ENUM('agencia','cliente') NULL,

  -- El auto sigue a nombre del dueño mientras está en el playón.
  seguro_a_cargo        ENUM('agencia','cliente') NOT NULL DEFAULT 'cliente',

  -- Cuántos días después de la venta se le paga, y cómo.
  liquidacion_dias      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  liquidacion_forma     ENUM('transferencia','efectivo','cheque') NOT NULL DEFAULT 'transferencia',

  firmado_at            DATETIME NULL,
  contrato_json         JSON NULL,

  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at            DATETIME NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_ingreso (ingreso_id),

  CONSTRAINT consignacion_contratos_precio_valido   CHECK (precio_minimo >= 0),
  CONSTRAINT consignacion_contratos_comision_valida CHECK (
    comision_valor >= 0
    AND (comision_tipo <> 'porcentaje' OR comision_valor <= 100)
  ),
  CONSTRAINT consignacion_contratos_retiro_valido   CHECK (retiro_costo >= 0),
  -- Sin prueba de manejo no hay responsable que definir, y con prueba lo tiene
  -- que haber: es el punto que se discute cuando aparece un rayón.
  CONSTRAINT consignacion_contratos_prueba_valida   CHECK (
    (prueba_manejo = FALSE AND prueba_responsable IS NULL)
    OR (prueba_manejo = TRUE AND prueba_responsable IS NOT NULL)
  ),
  -- Un contrato firmado tiene que tener su copia congelada, y viceversa.
  CONSTRAINT consignacion_contratos_firma_valida CHECK (
    (firmado_at IS NULL AND contrato_json IS NULL)
    OR (firmado_at IS NOT NULL AND contrato_json IS NOT NULL)
  ),

  CONSTRAINT consignacion_contratos_ingreso_fk FOREIGN KEY (ingreso_id)
    REFERENCES consignacion_ingresos (id) ON DELETE CASCADE ON UPDATE CASCADE
);
