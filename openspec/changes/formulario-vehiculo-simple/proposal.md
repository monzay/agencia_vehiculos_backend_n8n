# Formulario de Vehículos más simple

> Pedido del dueño el 2026-11-08.

## Why

El formulario de Vehículos pedía datos que la agencia no carga en ese momento: dominio, motor, chasis
y costo de compra. Tampoco había forma de indicar un auto que anda con nafta y con GNC. Al revisarlo
apareció además que la API pública devolvía el costo de compra de cada auto.

## What Changes

- **`vehiculos` (ADDED)**: combustibles permitidos, con el valor nuevo `nafta_gnc`; cualquier otro
  valor se rechaza.
- **`vehiculos` (ADDED)**: crear o editar un vehículo no pide dominio, motor, chasis ni costo. Editar
  sin mandarlos no los modifica, y el costo ya no se escribe por esa vía: un panel viejo abierto no
  puede borrar el que cargó Preparación.
- **`vehiculos` (ADDED)**: la API de vehículos no devuelve el costo de compra.
- El panel deja de mostrar esos cuatro campos, en Nuevo y en Editar.
- Los nombres de los combustibles del front pasan a un solo lugar.

## Impact

- Sin migración: `autos.combustible` es `VARCHAR(10)` y `nafta_gnc` entra.
- Decisión del dueño: un auto cargado a mano queda sin costo, y en Contabilidad suma facturación pero
  0 de ganancia. Los usados que salen de Preparación siguen trayendo el precio de compra.
- Dominio, motor y chasis se cargan en el boleto, que ya los exige y los guarda en la ficha.
- Lo que ya está guardado en los autos no se borra.
