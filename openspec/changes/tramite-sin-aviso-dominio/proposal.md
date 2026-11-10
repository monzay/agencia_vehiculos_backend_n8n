# Crear el trámite sin aviso de dominio

> Pedido del dueño el 2026-11-09.

## Why

El alta de vehículos ya no pide dominio, motor ni chasis, así que casi todos los autos llegan sin
esos datos. Al crear el trámite aparecía un aviso de alerta que parecía un error, cuando es el
camino normal: esos datos se piden en el boleto.

## What Changes

- **`tramites-alta` (ADDED)**: crear un trámite de venta no avisa que al vehículo le faltan dominio,
  motor o chasis. El boleto los sigue pidiendo como obligatorios.

## Impact

- Solo se quita el aviso del panel: sin migración y sin tocar el backend.
- El boleto no se puede guardar sin esos tres datos, igual que hasta ahora.
