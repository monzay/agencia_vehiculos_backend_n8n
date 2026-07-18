-- Migración manual: índice para el round-robin de asignación de vendedores.
--
-- El nodo n8n "MySQL: Asignar Vendedor" reparte de forma equitativa SOLO entre
-- los asesores que el admin tiene habilitados (UNION ALL con una fila centinela,
-- se elige por `prio ASC, carga ASC LIMIT 1`):
--   prio 0 → asesores elegibles, ordenados por menor carga:
--     WHERE v.activo=1 AND v.recibe_consultas=1 AND v.deleted_at IS NULL
--     carga = v.leads_activos
--   prio 1 → fila centinela (id=NULL): entra solo si no hay ningún asesor
--            habilitado. En ese caso la consulta queda SIN ASIGNAR
--            (sesiones.vendedor_id = NULL) y el bot sigue atendiendo al cliente.
-- El admin NO participa del reparto (solo administra desde el panel qué asesores
-- reciben, con el switch `recibe_consultas`).
-- El índice (activo, leads_activos) sirve a la rama prio 0: resuelve la igualdad
-- en `activo` y el orden por `leads_activos` sin filesort.
--
-- SEGURO: aditivo, online DDL, no toca columnas/tipos → no afecta al SQL de n8n.
-- Nota: hoy hay pocas filas, el impacto es mínimo; es prevención/hygiene.
--
-- Rollback:  ALTER TABLE vendedores DROP INDEX idx_activo_leads;

ALTER TABLE `vendedores`
  ADD INDEX `idx_activo_leads` (`activo`, `leads_activos`),
  ALGORITHM=INPLACE, LOCK=NONE;
