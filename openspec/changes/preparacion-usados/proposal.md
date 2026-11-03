# Preparación de usados

> Decisiones del dueño del 2026-10-09, retomadas el 2026-11-03. Fase 5 del flujo de la consulta a la entrega.

## Why

Solo la consignación tiene camino a la web. Un usado comprado o recibido en parte de pago no se puede
publicar desde su trámite, y suele necesitar arreglos antes.

## What Changes

- **`preparacion-usados` (ADDED)**: sección Preparación. El usado entra solo al firmar el boleto de una
  compra o de una parte de pago con usado, y sale al desfirmarlo si nunca tuvo ficha en la web.
- Para publicar hacen falta título, Formulario 08 e informe de dominio limpio, una foto y el precio.
- Publicar crea la ficha en Vehículos con los datos del título y `costo` = valor de toma del boleto.
- **Sacar de la web** conserva la ficha, salvo que el auto esté vendido, señado o en un trámite.
- La compra pasa a Vendido cuando se vende ese usado, y vuelve si se deshace la venta. Así su dominio
  deja de estar tomado.
- El asesor lee, sin el valor de toma ni el titular. Editar y publicar son del admin.

## Impact

- Migración 079: tabla `preparaciones`, con backfill de los boletos ya firmados. En producción se aplica
  antes del backend. Reemplaza a la 065 que se había planeado.
- `firmarCompraventa` y `desfirmarCompraventa` pasan a una transacción.
- Fuera de esta fase: arreglos con costo y margen, y alertas de días en preparación.
