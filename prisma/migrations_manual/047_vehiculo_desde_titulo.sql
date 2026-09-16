-- Los datos del vehículo salen del título, no del alta.
--
-- Hasta acá el alta de la consignación pedía dominio, marca, modelo y año a
-- mano, y después el título volvía a pedir lo mismo para compararlo. Ahora el
-- alta pide solo al titular y los datos de recepción (km y notas), y es el
-- título, al cargarse, el que escribe el vehículo del ingreso.
--
-- Por eso las cuatro columnas que eran obligatorias pasan a aceptar NULL: un
-- ingreso recién creado todavía no tiene título y, por lo tanto, no tiene
-- vehículo. Se completan cuando se carga el título.
--
-- Qué se mantiene:
--   · Las columnas siguen en `consignacion_ingresos` y no dentro del JSON del
--     título, porque se buscan por dominio, se valida que un dominio no esté
--     tomado dos veces, y la cédula verde y el informe de dominio se comparan
--     contra ellas.
--   · Los CHECK de año siguen valiendo: con NULL la condición no falla.
--   · Los km de recepción y las notas no están en el título: se siguen cargando
--     en el alta.
--
-- Rollback (solo si todos los ingresos tienen título cargado):
--   ALTER TABLE `consignacion_ingresos`
--     MODIFY `dominio` VARCHAR(15) NOT NULL,
--     MODIFY `marca`   VARCHAR(60) NOT NULL,
--     MODIFY `modelo`  VARCHAR(80) NOT NULL,
--     MODIFY `anio`    SMALLINT UNSIGNED NOT NULL;

ALTER TABLE `consignacion_ingresos`
  MODIFY `dominio` VARCHAR(15)       NULL,
  MODIFY `marca`   VARCHAR(60)       NULL,
  MODIFY `modelo`  VARCHAR(80)       NULL,
  MODIFY `anio`    SMALLINT UNSIGNED NULL;
