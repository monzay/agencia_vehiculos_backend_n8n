-- Los papeles de una consignación: la foto del documento más lo que dice.
--
-- UNA tabla para los once tipos, no once tablas. Lo que comparten es lo único
-- que el sistema necesita para operar: qué papel es, cuándo se cargó y quién lo
-- cargó, dónde está el original de verdad, y cuándo vence. Esos cinco son
-- columnas tipadas porque son los que se filtran ("qué vence este mes",
-- "qué falta de este ingreso").
--
-- Lo propio de cada tipo va en `datos_json`: el título pide motor, chasis,
-- origen y prenda; la VTV pide una sola fecha. Con columnas fijas la fila de la
-- VTV quedaría con veinte casillas vacías, y cada papel nuevo sería una
-- migración. La forma de cada tipo se declara en el catálogo del backend
-- (src/lib/documentos-catalogo.js), que es el que valida antes de guardar y el
-- que dibuja el formulario del panel: una sola fuente para las dos cosas.
--
-- Si algún día hace falta filtrar por un campo del JSON (por ejemplo "autos con
-- prenda"), MySQL permite promoverlo a columna generada e indexarla sin migrar
-- los datos. No queda nada trabado.
--
-- Lo que se guarda acá es LO QUE DICE EL PAPEL, no la verdad del vehículo, que
-- vive en `consignacion_ingresos`. Están separados a propósito: si el título
-- declara un motor y la cédula verde otro, el sistema los compara y avisa. Si
-- el documento escribiera sobre el ingreso, el segundo papel pisaría al primero
-- y la diferencia se perdería en silencio.
--
-- `imagenes_json` es una lista porque un papel puede tener varias caras: el DNI
-- viene frente y dorso. Mismo criterio que `autos.fotos_json`.
--
-- No hay unique (ingreso_id, tipo): un papel puede recargarse tras vencer, y la
-- versión vieja queda con `deleted_at` para auditoría. Que haya un solo vigente
-- por tipo lo resuelve el servicio, como ya hace `consignaciones`.
--
-- Rollback:
--   DROP TABLE `consignacion_documentos`;

CREATE TABLE IF NOT EXISTS consignacion_documentos (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ingreso_id        INT UNSIGNED NOT NULL,

  tipo ENUM(
    'titulo',
    'cedula_verde',
    'libre_deuda_patentes',
    'libre_deuda_infracciones',
    'vtv',
    'verificacion_policial',
    'dni_titular',
    'dni_conyuge',
    'constancia_cuit',
    'comprobante_domicilio',
    'comprobante_cbu'
  ) NOT NULL,

  -- Array de URLs de Vercel Blob. NULL mientras el papel está pendiente.
  imagenes_json     JSON NULL,

  -- Los cuatro campos que van en todos los papeles, sin excepción.
  fecha_carga       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cargado_por       INT UNSIGNED NULL,
  -- Dónde está el papel de verdad: carpeta, caja fuerte, se lo llevó el cliente.
  ubicacion_fisica  VARCHAR(120) NULL,
  -- NULL si ese tipo de papel no vence.
  fecha_vencimiento DATE NULL,

  -- Campos propios del tipo, validados contra el catálogo del backend.
  datos_json        JSON NULL,

  observaciones     TEXT NULL,

  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at        DATETIME NULL,

  PRIMARY KEY (id),

  CONSTRAINT consignacion_documentos_ingreso_fk FOREIGN KEY (ingreso_id)
    REFERENCES consignacion_ingresos (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT consignacion_documentos_usuario_fk FOREIGN KEY (cargado_por)
    REFERENCES usuarios (id) ON DELETE SET NULL ON UPDATE CASCADE,

  INDEX idx_ingreso (ingreso_id, tipo, deleted_at),
  -- Para el aviso de papeles por vencer, que barre todos los ingresos.
  INDEX idx_vencimiento (deleted_at, fecha_vencimiento)
);
