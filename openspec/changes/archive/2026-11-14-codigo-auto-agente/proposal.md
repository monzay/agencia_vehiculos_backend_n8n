# El código del auto que escribe la IA

> Pedido del dueño el 2026-11-11, por un caso del 10/11 en producción (cliente 37, sesión 39): el bot le dijo
> a un cliente que el Chevrolet Onix LTZ (ref 13) "ya no está disponible" cuando estaba a la venta.

## Why

La IA llamó a `enviar_fotos_auto` con el código `#13`, copiado del mensaje de la web (`(REF #13)`). Las
herramientas buscan el código por igualdad exacta: no encontraron nada y `enviar_fotos_auto` respondió
"El auto no está disponible.". La IA le creyó y se disculpó por haber dicho que estaba disponible. Se
reprodujo en 2 de 30 corridas con el mismo prompt, historial y herramientas.

Lo que lo hizo posible:
- Después del primer mensaje, el contexto no dice cuál es el auto de la consulta: la IA saca el código del
  texto viejo del cliente, donde figura con `#`.
- El código no se normaliza, y el casillero lo pide "tal como figura en la web", o sea con `#`.
- Un código mal escrito y un auto vendido responden lo mismo.
- `registrar_calificacion` no guarda un código que no reconoce, y no avisa.
- Las llamadas a herramientas no se loguean: no se pudo ver qué código mandó la IA.

## What Changes

- **`agente-herramientas` (ADDED)** "El código del auto que escribe la IA": primero el código exacto; si no
  existe, el código limpio (`#13`, `REF #13`, `ref 13` → `13`). Aplica a `ver_auto`, `buscar_similares`,
  `enviar_fotos_auto` y `registrar_calificacion`. Los casilleros piden el código sin `#` ni REF.
- **`agente-herramientas` (ADDED)** "Código inexistente no es lo mismo que no disponible": un código que no
  existe responde `codigo_inexistente`, con lo que tiene que hacer la IA. Un auto que no se puede ofrecer
  responde como siempre.
- **`agente-herramientas` (ADDED)** "Registro de cada llamada a una herramienta": una línea por llamada,
  sin datos personales.
- **`agente-calificacion` (MODIFIED)** "Guardar lo que respondió el cliente": el auto de interés se resuelve
  con el código limpio y, si no se guarda, el resultado trae un `aviso`.
- **`agente-conversacion` (MODIFIED)** "Contexto de cada turno": suma el auto de la consulta con su código.
- **`agente-comportamiento` (MODIFIED)** "Solo datos reales": un código inexistente no es un auto no disponible.

## Impact

- Solo cambia `src/agente/`: `origen-web.js` (función nueva `codigoDeAuto`), `herramientas.js`,
  `instrucciones.js`, `atender.js` y sus tests.
- No cambian:
  - la tabla `autos` ni sus refs: no hay migración ni permisos nuevos, porque `agente_ia` ya lee `autos.id` y `autos.ref`;
  - cómo se genera un ref, en el alta y en la importación;
  - la API `/api/vehiculos/:ref` y el catálogo;
  - el mensaje de la web `(REF #x)` y su lectura (`datosDeLaWeb`);
  - qué auto está disponible (`whereDisponible`);
  - el link de la ficha (`linkDelCatalogo`), que ahora recibe el código ya resuelto;
  - señas, trámites, consignaciones, descuentos, promociones, el panel y n8n.
- Una consulta más a la base por cada herramienta que recibe un código, por el índice único de `ref`. Son
  dos si el código exacto no existe.
- Cambiar las instrucciones y las herramientas invalida una vez la caché de Claude (unos 8.400 tokens).
- Despliegue: solo el backend, sin migración, y solo cuando el dueño lo pida.
