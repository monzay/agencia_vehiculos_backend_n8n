# Avanzar desde una consulta sin buscar al cliente

> Pedido del dueño el 2026-11-09.

## Why

Al avanzar una consulta a una seña o una venta, el formulario ya llega con los datos del cliente,
pero igual muestra el buscador y pide buscarlo primero. Si viene de una consulta ya se sabe quién
es: buscarlo no aporta nada y confunde.

## What Changes

- **`tramites-precarga` (ADDED)**: el formulario que se abre desde una consulta no ofrece el
  buscador de clientes. Los datos de la consulta siguen editables.
- El texto de ayuda deja de decir "Buscalo primero" y pide revisar los datos y completar lo que falte.
- La sección Trámites sigue igual, con el buscador.

## Impact

- Solo cambia el panel: sin migración y sin tocar el backend ni el bot.
- El DNI que la consulta no tenga se carga a mano. Decisión del dueño: no se deduce del CUIL.
- Si compra otra persona, se escribe encima de los datos; al guardar, el alta la reconoce por DNI
  si ya existe.
