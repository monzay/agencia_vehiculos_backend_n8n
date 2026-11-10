# Anticipo y precio al contado

> Pedido del dueño el 2026-11-08. Plan aprobado el 2026-11-09.

## Why

La lista de precios de la agencia tiene dos columnas, contado y financiado o permuta, pero cada auto
guardaba un solo precio. El dueño quiere publicar también el precio al contado y el anticipo.

## What Changes

- **`vehiculos` (ADDED)**: un vehículo puede tener anticipo y precio al contado, los dos opcionales.
- **`vehiculos` (ADDED)**: la API de vehículos los devuelve y la ficha pública los muestra solo si tienen dato.
- **`vehiculos` (ADDED)**: el boleto de una venta al contado arranca con el precio al contado, si está
  cargado. Con parte de pago arranca con el precio, como hasta ahora.
- **`vehiculos` (ADDED)**: la sección Descuentos/Promos sale del menú del panel por ahora.

## Impact

- Migración `080`: dos columnas `DECIMAL(12,2) NULL` en `autos`. Va antes que el backend: el backend
  nuevo las lee en cada consulta de autos.
- Decisión del dueño: `precio` pasa a ser el financiado o de permuta. La columna no cambia; cambia con
  qué número se carga.
- El bot no se toca: sigue informando solo `precio` y su usuario de base no recibe permiso sobre las
  columnas nuevas. Si un auto tiene los dos precios, el bot no conoce el de contado.
- Los descuentos siguen aplicándose solo a `precio`.
- Cerrar la sección no apaga lo que ya está cargado: los descuentos y promociones vigentes se siguen
  aplicando en el catálogo, en la ficha y en el bot.
- Antes del deploy falta definir cómo se actualizan los autos ya publicados, según qué se cargó en `precio`.
