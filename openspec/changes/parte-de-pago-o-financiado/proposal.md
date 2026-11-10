# Parte de pago o financiado

> Pedido del dueño el 2026-11-09.

## Why

Falta una forma clara de registrar al cliente que solo financia y deja el anticipo. "Venta con parte
de pago" ya lo resuelve si no entrega usado (mismo boleto y mismas cuotas), pero el nombre no lo dice
y el anticipo hay que escribirlo a mano. El dueño prefirió renombrarla antes que crear otro trámite.

## What Changes

- **`tramites-precarga` (ADDED)**: la opción pasa a llamarse "Venta financiada o con parte de pago",
  y el trámite "Parte de pago o financiado" en el formulario y en Documentos.
- **`tramites-precarga` (ADDED)**: sin usado, el monto que deja el cliente arranca con el anticipo
  cargado en el vehículo, editable. Con usado queda vacío.

## Impact

- Sin migración: en la base sigue siendo `permuta`. El backend solo suma el anticipo a la precarga.
- El anticipo que dijo el cliente en el chat se sigue viendo, pero no se usa como monto.
- Las dos variantes comparten pestaña en Documentos. Se distinguen por si tienen usado (`conUsado`).
