# Vínculo de la consulta con su trámite o seña

> Pedido del dueño el 2026-11-03. Fase 3 del flujo de la consulta a la entrega.

## Why

La consulta no recuerda qué nació de ella: el admin no ve si ya avanzó, puede abrir un segundo
trámite por la misma consulta y, desde el legajo, no puede volver a la conversación.

## What Changes

- **`consultas-avance` (ADDED)**: cada trámite y cada seña guardan la consulta de la que nacieron.
- La lista de consultas dice si ya avanzó: Señado, Seña vencida, En trámite o Vendido.
- En la consulta, **Avanzar** cambia por **Ver trámite** o **Ver seña**, solo para admin.
- El legajo tiene **Ver consulta**.
- Una consulta que ya avanzó no vuelve a avanzar. Si el trámite o la seña se cancelan, queda libre.

## Impact

- Migración 077: `sesion_id` nulo y no único en `consignacion_ingresos` y `senas`. En producción se
  aplica antes del backend.
- `POST /api/ingresos` y `POST /api/senas` aceptan `sesionId`, opcional. Compra y consignación lo
  rechazan: no nacen de una consulta.
- Trámites y señas anteriores quedan sin vínculo.
