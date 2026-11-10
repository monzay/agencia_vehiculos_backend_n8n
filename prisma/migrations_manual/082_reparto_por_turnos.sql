-- Reparto por turnos de las consultas entre los asesores (decisión del dueño, 10/11/2026).
--
--   reparto_ultimo_vendedor     -> clave nueva de `configuracion`: el id del último asesor que recibió una
--                                  consulta por turno. El backend la lee con SELECT ... FOR UPDATE para que
--                                  dos consultas simultáneas no reciban el mismo turno. Arranca en NULL
--                                  (nadie recibió todavía: el primer turno es del asesor de menor id).
--   reparticion_equitativa      -> queda en '1' (encendido por defecto). Hasta hoy el interruptor solo
--                                  ocultaba la columna del asesor; ahora enciende el reparto, y el dueño
--                                  lo quiere prendido.
--   vendedores.recibe_consultas -> todos los asesores no borrados pasan a 1 (habilitados por defecto, orden
--                                  del dueño). Hasta hoy ese switch no hacía nada con el agente actual:
--                                  ningún código lo leía para asignar.
--
-- SE APLICA UNA SOLA VEZ. Volver a correrla vuelve a encender el reparto y a habilitar a todos los asesores,
-- aunque el dueño los haya apagado después desde el panel. No cambia el schema de Prisma.
--
-- Orden al desplegar: primero esta migración y después el backend. Sin la fila `reparto_ultimo_vendedor`
-- el backend nuevo igual reparte (la crea con el upsert), pero sin el bloqueo previo de la fila.
--
-- Antes de aplicarla en producción, guardar el estado actual:
--   SELECT id, nombre, activo, recibe_consultas FROM vendedores WHERE deleted_at IS NULL;
--   SELECT clave, valor FROM configuracion WHERE clave IN ('reparticion_equitativa','reparto_ultimo_vendedor');
--
-- Rollback (con el backend anterior ya desplegado): restaurar con los valores guardados arriba.
--   UPDATE vendedores SET recibe_consultas = 0 WHERE id IN (<ids que estaban en 0>);
--   UPDATE configuracion SET valor = '<valor guardado>' WHERE clave = 'reparticion_equitativa';
--   DELETE FROM configuracion WHERE clave = 'reparto_ultimo_vendedor';
-- Borrar la fila del puntero solo es seguro con el backend viejo ya desplegado: el nuevo la lee en cada turno.

INSERT INTO `configuracion` (`clave`, `valor`) VALUES ('reparto_ultimo_vendedor', NULL)
  ON DUPLICATE KEY UPDATE `clave` = `clave`;

INSERT INTO `configuracion` (`clave`, `valor`) VALUES ('reparticion_equitativa', '1')
  ON DUPLICATE KEY UPDATE `valor` = '1';

UPDATE `vendedores` SET `recibe_consultas` = 1 WHERE `deleted_at` IS NULL AND `recibe_consultas` <> 1;
