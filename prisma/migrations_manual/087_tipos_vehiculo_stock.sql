-- Tipos de vehículo del stock: corrige `autos.tipo_vehiculo` según el modelo y la versión.
-- Cambio OpenSpec `tipos-de-vehiculo`.
--
-- Los tipos pasan a ser auto, camioneta, camion y moto. Camioneta incluye SUV, pick-ups y furgones.
-- Hasta ahora los camiones y los furgones estaban cargados como auto o camioneta.
--
-- SOLO DATOS: no cambia el esquema (`tipo_vehiculo` ya es VARCHAR). Sin GRANT.
-- SE PUEDE CORRER DOS VECES: las reglas dependen del texto del modelo y no del tipo actual, así que
-- la segunda pasada deja todo igual.
-- Producción corre con sql_mode ANSI: strings solo con comillas simples, sin `"` ni `||`.
-- Se aplica a mano, sentencia por sentencia, con el cliente mysql, en una sola sesión (las
-- variables @re_* viven en la sesión).
--
-- Reglas, en este orden. Todas miran solo los vehículos no borrados y NO tocan las motos:
--   a. camion    -> el modelo o la versión dice "camión", o es Delivery, Accelo, Atego, Actros,
--                   Constellation, Tector o Axor.
--   b. camioneta -> (y no entró en a) es una pick-up, un SUV o un furgón de la lista, o la versión
--                   dice "furgón".
--   c. auto      -> (y no entró en a ni en b) monovolúmenes: Idea, Suran, Meriva, Spin, Zafira,
--                   Picasso, Scenic.
--   d. auto      -> los que no tienen tipo (NULL).
-- Los que no entran en ninguna regla quedan como están.
--
-- Orden al desplegar: esta migración y el backend pueden ir en cualquier orden (el backend viejo
-- guarda lo que le llega y el nuevo acepta `camion`), pero conviene correrla DESPUÉS del backend,
-- así el panel ya reconoce el tipo `camion`.
--
-- Rollback: no hay vuelta atrás exacta (la migración pisa el tipo anterior y no lo guarda).
-- Se restaura `autos.tipo_vehiculo` desde el respaldo de la base tomado justo antes de correrla.

-- Texto a comparar: ' marca modelo version ' en minúsculas, con espacios en los bordes para que
-- los nombres de modelo se busquen como palabra completa.

SET @re_camion = 'cami[oó]n|[^a-z0-9](delivery|accelo|atego|actros|constellation|tector|axor)[^a-z0-9]';

SET @re_camioneta = 'furg|[^a-z0-9](hilux|ranger|amarok|strada|frontier|s10|s-10|toro|saveiro|montana|oroch|alaskan|maverick|dakota|d-max|l200|navara|f-150|ram|gladiator|ecosport|duster|captur|sw4|tiggo|t-cross|tracker|compass|renegade|2008|3008|5008|kicks|creta|nivus|taos|territory|kardian|koleos|tiguan|rav4|corolla cross|hr-v|cr-v|wr-v|x-trail|sportage|tucson|pulse|fastback|aircross|commander|trailblazer|equinox|bronco|kuga|wrangler|cherokee|outlander|pajero|jeep|kangoo|partner|berlingo|fiorino|sprinter|master|trafic|boxer|jumper|ducato|daily|transit|expert|vito|doblo|caddy|combo)[^a-z0-9]';

SET @re_monovolumen = '[^a-z0-9](idea|suran|meriva|spin|zafira|picasso|scenic)[^a-z0-9]';

-- a. Camiones.
UPDATE autos
SET tipo_vehiculo = 'camion'
WHERE deleted_at IS NULL
  AND (tipo_vehiculo IS NULL OR tipo_vehiculo <> 'moto')
  AND LOWER(CONCAT(' ', marca, ' ', modelo, ' ', IFNULL(version, ''), ' ')) REGEXP @re_camion;

-- b. Camionetas (SUV, pick-ups y furgones) que no son camiones.
UPDATE autos
SET tipo_vehiculo = 'camioneta'
WHERE deleted_at IS NULL
  AND (tipo_vehiculo IS NULL OR tipo_vehiculo <> 'moto')
  AND NOT (LOWER(CONCAT(' ', marca, ' ', modelo, ' ', IFNULL(version, ''), ' ')) REGEXP @re_camion)
  AND LOWER(CONCAT(' ', marca, ' ', modelo, ' ', IFNULL(version, ''), ' ')) REGEXP @re_camioneta;

-- c. Monovolúmenes: son autos aunque hayan estado cargados como camioneta.
UPDATE autos
SET tipo_vehiculo = 'auto'
WHERE deleted_at IS NULL
  AND (tipo_vehiculo IS NULL OR tipo_vehiculo <> 'moto')
  AND NOT (LOWER(CONCAT(' ', marca, ' ', modelo, ' ', IFNULL(version, ''), ' ')) REGEXP @re_camion)
  AND NOT (LOWER(CONCAT(' ', marca, ' ', modelo, ' ', IFNULL(version, ''), ' ')) REGEXP @re_camioneta)
  AND LOWER(CONCAT(' ', marca, ' ', modelo, ' ', IFNULL(version, ''), ' ')) REGEXP @re_monovolumen;

-- d. Sin tipo cargado: auto.
UPDATE autos
SET tipo_vehiculo = 'auto'
WHERE deleted_at IS NULL
  AND tipo_vehiculo IS NULL;
