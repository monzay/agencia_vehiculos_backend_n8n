# consultas-lista Specification

## Purpose
TBD - created by archiving change huecos-del-bot. Update Purpose after archive.

## Requirements

### Requirement: Orden de la lista de Consultas
La lista de Consultas MUST ordenarse por la última vez que cada consulta subió, la más reciente primero.
Una consulta MUST subir al abrirse, al cambiar de auto, al volver a pendiente porque el cliente escribió y
al pasar a otro asesor por un link (ver `agente-conversacion`). Las consultas que ya existen MUST
ordenarse por su inicio.
<!-- id: consultas.service.listar -->

#### Scenario: Sube por otro auto
- **WHEN** una consulta de hace 20 días cambia de auto
- **THEN** queda primera en la lista, antes que las abiertas en los últimos días
<!-- test: src/services/consultas.service.test.js › "Sube por otro auto: una consulta de hace 20 días que cambió de auto hoy sale primera, antes de las abiertas en los últimos días" -->

#### Scenario: Sube porque el cliente volvió a escribir
- **WHEN** una consulta atendida de hace 20 días recibe un mensaje del cliente
- **THEN** queda primera en la lista
<!-- test: src/services/consultas.service.test.js › "Sube porque el cliente volvió a escribir: una consulta atendida de hace 20 días con un mensaje hoy sale primera" -->

#### Scenario: Consultas que ya existían
- **WHEN** se aplica la migración
- **THEN** las consultas que ya existían quedan en el mismo orden que antes
<!-- test: scripts/migracion-084.test.js › "aplicada dos veces sobre una copia de sesiones termina bien, deja la columna NOT NULL, UN índice y rellena con sesion_inicio o 1000-01-01" -->
