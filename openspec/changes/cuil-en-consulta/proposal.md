# El CUIL que informa la persona, visible en la consulta

> Pedido del dueño el 2026-11-03.

## Why

El CUIL válido se guarda en la ficha solo si coincide con ella. Si el cliente se equivoca y lo
corrige, el segundo se rechaza y queda únicamente en el texto del chat: el asesor ve el aviso
"CUIL no coincide" sin ver cuál informó. Además, el CUIL no aparece entre los datos de la consulta.

## What Changes

- **`agente-credito` (ADDED)**: columna `sesiones.cuil_informado` con el último CUIL válido que
  dio la persona en esa consulta, y el CUIL entre los datos de la consulta del panel.
- `clientes.cuil` sigue igual: el primero válido, sin reemplazarse. La consulta al BCRA se hace
  con el de la ficha, igual que antes.

## Impact

- Migración `076_sesiones_cuil_informado.sql`: columna nueva y nula, no toca filas existentes.
- Dato personal: se puede guardar un CUIL que no sea de quien escribe. Ya estaba en el historial
  de mensajes; ahora queda además en un campo, visible para los usuarios del panel.
- `agente_ia` no recibe `UPDATE` sobre la columna. Tiene `SELECT` de toda la tabla `sesiones` (067).
