# El bot conoce todos los datos públicos del auto

> Pedido del dueño el 2026-11-11.

## Why

El bot no veía el precio al contado ni el anticipo, que el panel carga y la web pública muestra.
Probado con Claude real: ante "¿cuál es el precio de contado?" daba `precio` diciendo que era el de
contado. Tampoco veía la versión, el stock ni la descripción, y `buscar_autos` solo filtraba por tipo,
presupuesto, año mínimo y marca.

## What Changes

- **`agente-herramientas` (MODIFIED)**: la ficha del bot suma versión, stock, precio al contado y
  anticipo. `precio` pasa a llamarse `precio_lista`: es el precio de lista, no el financiado. Lo que
  no está cargado va en `null`.
- **`agente-herramientas` (MODIFIED)**: `ver_auto` trae además la descripción, en una línea y
  recortada. Las búsquedas no la traen, para no inflar las respuestas.
- **`agente-herramientas` (MODIFIED)**: `buscar_autos` filtra también por condición (0 km o usado),
  modelo o versión, combustible, año máximo, km máximo y presupuesto de contado.
- **`agente-herramientas` (MODIFIED)**: el usuario de base del agente puede leer esas columnas
  (migración 083).
- **`agente-comportamiento` (ADDED)**: reglas de precios. Si pregunta el de contado, da el de contado;
  si no está cargado, dice que no cuenta con esa información y nunca da el de lista como de contado.
  Si el cliente dice que paga de contado, le menciona el precio de contado. El anticipo, igual. El
  stock nunca se usa para apurar.

## Impact

- Migración `083_agente_ficha_completa.sql`: solo `GRANT SELECT` por columna. Orden de deploy:
  083 → backend. Si sube el backend sin la 083, el agente no puede leer autos y responde el respaldo.
- `buscar_autos` deja el modo estricto (como `registrar_calificacion`): con 10 filtros opcionales
  pasaría el máximo de 16 campos opcionales que admite Claude. Zod sigue validando todo.
- Sin cambios en el panel ni en la web.
