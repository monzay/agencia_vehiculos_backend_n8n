# Avanzar de la consulta al trámite

> Pedido del dueño el 2026-11-03. Fase 1 del flujo de la consulta a la entrega.

## Why

Hoy no hay forma de pasar de una consulta a un trámite: el admin cambia de sección y vuelve a
tipear los datos del cliente, el auto y el usado que el bot ya tiene guardados.

## What Changes

- **`tramites-precarga` (ADDED)**: lectura solo para admin con los datos de una consulta listos
  para el alta de la seña o la venta.
- Botón **Avanzar** en la consulta de compra abierta, solo para admin. Abre ahí mismo un menú con
  Seña, Venta al contado y Venta con parte de pago, sin sugerir ninguna, y después el formulario
  precargado.
- Avanzar **no crea nada** hasta confirmar el formulario. La sección Trámites queda para los
  clientes que no vienen de una consulta, y por ahí entran compra y consignación.

## Impact

- Sin migración: la consulta todavía no recuerda su trámite (Fase 3).
- Lo que dijo el cliente es orientativo: se puede editar y no reemplaza a los papeles. El valor de
  toma y el anticipo no se precargan.
- Datos personales: la ruta queda bajo `/api/ingresos`, que ya es solo admin.
