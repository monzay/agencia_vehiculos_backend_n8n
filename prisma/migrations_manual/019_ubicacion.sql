-- Ubicación física de la agencia. Es un dato relacional con tipos propios
-- (latitud/longitud numéricas), no un par clave-valor, así que no va en
-- `configuracion`: ahí `valor` es VARCHAR y las coordenadas quedarían como texto.
--
-- Tabla de UNA sola fila: el CHECK impide insertar una segunda. La agencia tiene
-- una única ubicación, y así el bot puede leerla sin desambiguar.
CREATE TABLE IF NOT EXISTS ubicacion (
  id         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  nombre     VARCHAR(120)  NOT NULL,
  direccion  VARCHAR(200)  NOT NULL,
  -- NULL = todavía no se cargaron. WhatsApp las necesita para el pin del mapa.
  latitud    DECIMAL(10,7) NULL,
  longitud   DECIMAL(10,7) NULL,
  updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT ubicacion_fila_unica CHECK (id = 1),
  CONSTRAINT ubicacion_lat_valida CHECK (latitud  IS NULL OR (latitud  BETWEEN  -90 AND  90)),
  CONSTRAINT ubicacion_lng_valida CHECK (longitud IS NULL OR (longitud BETWEEN -180 AND 180))
);

-- Fila inicial vacía para que el panel siempre tenga algo que editar.
INSERT IGNORE INTO ubicacion (id, nombre, direccion) VALUES (1, '', '');
