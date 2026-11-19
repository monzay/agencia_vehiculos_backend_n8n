# Tipos de vehículo: auto, camioneta, camión y moto

> Pedido del dueño el 2026-11-19 (ver `OBJETIVO.md`).

## Why

El sistema tenía tres tipos: auto, camioneta y moto. Un camión no tenía lugar y quedaba como "auto". Además,
en producción hay vehículos con el tipo mal cargado: la Strada Adventure, una Hilux, la SW4, las Duster y la
EcoSport figuran como "auto", y el Fiat Idea como "camioneta". El dueño eligió cuatro tipos, "más fácil":
auto, camioneta, camión y moto. Camioneta junta SUV, pick-ups y furgones.

## What Changes

- **`tipos-vehiculo` (ADDED)**: los tipos pasan a ser auto, camioneta, camion y moto. "Camión", con o sin
  tilde, se guarda como `camion`.
- **`tipos-vehiculo` (ADDED)**: el panel, el catálogo, la tarjeta y la ficha muestran "Camión" o "Camiones"
  con el ícono de camión. La camioneta pasa a tener su propio ícono de pick-up.
- **`tipos-vehiculo` (ADDED)**: el bot puede buscar camiones, y la descripción del filtro le explica qué es
  cada tipo.
- **`tipos-vehiculo` (ADDED)**: la importación de listas reconoce el tipo camión y le explica al modelo qué
  es cada tipo.
- **`tipos-vehiculo` (ADDED)**: la migración 087 corrige el tipo de los vehículos que ya están cargados
  (solo datos).

## Impact

- **Base:** la 087 cambia solo datos. La columna `tipo_vehiculo` (VARCHAR(10)) no cambia. En producción, al
  19/11, corrige 25 de los 80 vehículos vigentes, los mismos que mostró la vista previa:
  - 22 a camioneta;
  - 2 a camión (Delivery y Mercedes 710, hoy ocultos);
  - 1 a auto (Fiat Idea).
- **Backend:** `lib/tipos-vehiculo.js`, la herramienta `buscar_autos` del bot y el esquema de la importación
  de listas.
- **Front:** `lib/tipos-vehiculo.js` y el subtítulo del catálogo. El formulario, el filtro, la tarjeta y la
  ficha toman los tipos de esa lista.
- **Sin cambios:** cómo se guarda un tipo desconocido (sigue quedando "auto") y los vehículos borrados.
