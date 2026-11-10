# Terminaciones del flujo de la consulta a la entrega

> Fase 6 del flujo de la consulta a la entrega, 2026-11-07.

## Why

Con las fases 1 a 5 en producción quedan cabos sueltos: en Documentos no se ve qué falta en cada
trámite ni se filtra lo que sigue abierto; una seña se puede extender o pasar a trámite sobre un
auto que ya está en otro trámite; deshacer una venta deja la seña cerrada; el admin no sabe cuántas
consultas terminan en venta; cuando Meta rechaza un envío del bot nadie se entera, y al retomar
después de una pausa el bot no ve lo que respondió el asesor.

## What Changes

- **`tramites-lista` (ADDED)**: filtro "En curso" en todas las modalidades, próximo paso en la lista
  y búsqueda también por el auto que se vendió.
- **`senas-reserva` (ADDED)**: extender una seña o pasarla a trámite revalida el auto; deshacer la
  venta devuelve la seña a vigente.
- **`consultas-conversion` (ADDED)**: conversión por asesor en Resumen, solo para el admin.
- **`agente-envio-fallido` (ADDED)**: endpoint para que n8n avise un envío rechazado; la consulta
  queda marcada para un vendedor.
- El agente lee las respuestas del asesor al retomar (escenario en `consultas-intervencion`).
- Se quita la sección Consignaciones del panel: las consignaciones se crean en Trámites y se
  siguen en Documentos.
- Un test verifica que cada ancla de los specs apunte a un test que existe.

## Impact

- Sin migración.
- La API de `/api/consignaciones` sigue en el backend; el panel ya no la usa.
- En n8n, la salida de error de "WA: Enviar" del flujo "Agente — cartero" llama al endpoint nuevo.
