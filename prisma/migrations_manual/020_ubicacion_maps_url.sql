-- Link de Google Maps que pega el admin. Es la forma amigable de cargar la
-- ubicación: el backend le extrae latitud y longitud (ver lib/maps-url.js), así
-- nadie tiene que tipear coordenadas a mano.
--
-- Se guarda el link además de las coordenadas porque sirve para volver a
-- editarlo y para verificar el punto desde el panel.
-- 500 caracteres: las URLs de Maps con `data=!3m...` son largas.
ALTER TABLE ubicacion
  ADD COLUMN maps_url VARCHAR(500) NULL AFTER direccion;
