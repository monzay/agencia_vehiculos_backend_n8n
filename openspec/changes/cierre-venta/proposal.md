# Cobrado, Entregado y Transferido

> Pedido del dueño el 2026-11-03. Fase 4 del flujo de la consulta a la entrega.

## Why

El trámite terminaba en Vendido. No quedaba registro de si se cobró, si el auto se entregó ni si se
transfirió, y el plazo para transferir solo se veía dentro del boleto.

## What Changes

- **`tramites-cierre` (ADDED)**: en una venta de la agencia ya vendida se marcan Cobrado, Entregado y
  Transferido con la fecha real, sin orden obligatorio. Se sugiere entregar antes de transferir.
- La entrega puede llevar una foto, que se publica en la galería de la web.
- El legajo avisa "Transferir hasta el…", con la fecha impresa en el boleto.
- Deshacer una venta exige desmarcar antes lo que se marcó.
- Un auto en un trámite de venta no se vende ni se reabre por la ruta `/api/vehiculos/:ref/venta`,
  solo desde su legajo. El panel no tiene ese botón: la regla cierra el camino por la API para vender
  sin el boleto firmado.

## Impact

- Migración 078: tabla `tramite_hitos` y `entregas.ingreso_id`. En producción se aplica antes del backend.
- `entrega_at` del boleto no se toca: es lo pactado y firmado.
- El cobro es una marca con fecha: no registra montos ni reemplaza a una caja.
- Compra y consignación no llevan estos hitos. El comprador de un consignado sigue sin cargarse.
