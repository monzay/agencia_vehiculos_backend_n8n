# Huecos del bot: un mes de memoria y el mismo asesor

> Pedido del user en `OBJETIVO.md` (2026-11-14), con sus ajustes del mismo día. Este archivo lo arma Claude a
> partir de ese.

## Why

Hoy una consulta dura 24 horas desde el último mensaje. Si el cliente vuelve al otro día:

- se abre una consulta nueva y vacía: el bot vuelve a preguntar la forma de pago, el anticipo, el usado y
  quién decide;
- la consulta nueva va por turno, así que puede tocarle otro asesor;
- si pregunta por otro auto, se abre otra consulta más (regla "Una consulta por auto", del 31/10/2026);
- si el asesor ya la había marcado como atendida, no se entera de que el cliente volvió.

## What Changes

1. **Una consulta dura 30 días desde su último mensaje** (antes, 24 horas). Dentro del plazo, el cliente
   sigue en la misma consulta: el mismo asesor y los mismos datos, y el bot no vuelve a preguntar lo que
   ya sabe. Pasado el plazo, se abre una consulta nueva: el bot pregunta todo de nuevo, no ve la charla
   anterior y la consulta va por turno, salvo que llegue con el link de un asesor.
2. **Otro auto dentro del plazo no abre otra consulta.** Cambia el auto de la consulta, el asesor recibe un
   aviso ("Ahora le interesa <nuevo>, antes <anterior>"), la consulta vuelve a pendiente si estaba atendida
   y sube al principio de la lista. Vale aunque la consulta ya tenga un trámite o una seña. Reemplaza "Una
   consulta por auto".
3. **El cliente vuelve a escribir en una consulta atendida** (por el mismo auto): vuelve a pendiente, el
   asesor recibe el aviso "Volvió a escribir" y sube al principio de la lista (ajuste del user, 14/11).
4. **Link de otro asesor.** La consulta ya pasa al asesor del link (no cambia). Lo nuevo: el asesor que la
   recibe la ve completa (charla y datos), pendiente y arriba de la lista, con un aviso.
5. **Audios.** Ya cumple lo pedido: el bot transcribe la nota de voz con Groq y responde al texto
   (`agente-cupos` › Audios con límite de duración y de costo). No cambia el código; se suma a la simulación.
6. **Simulación de más de 1000 consultas** en desarrollo, con Haiku 5.5 y Groq simulados (decisión del
   user, 14/11: "simula que se está usando la api de claude code y así como la api de groq"). Prueba que el
   sistema haga lo correcto. No mide cómo razona el modelo.

## Dónde corren las pruebas: solo en local

Pedido del user (14/11): **todas las pruebas son locales y usan la base de datos local.**

- Los tests de cada tarea, la simulación de más de 1000 consultas y cualquier prueba manual corren en esta
  máquina, contra el MySQL local (`localhost`).
- Los tests que usan base pasan por `src/lib/base-local.js`, que rechaza cualquier host que no sea local
  (incluida la base de Aiven).
- La simulación usa su propia base local, `agencia_simulacion`; los demás tests, la de desarrollo
  (`agencia`).
- Ninguna prueba toca la base de producción (Aiven) ni el servidor de producción, ni lee nada de ahí.

## Decisiones tomadas por defecto (confirmar al revisar)

| # | Decisión | Por qué |
|---|---|---|
| 1 | "Un mes" = 30 días desde el último mensaje de la consulta, no desde que se abrió. Con 30 días justos, ya venció | Las 24 horas de hoy se cuentan igual |
| 2 | Dentro de los 30 días, el bot no reconfirma los datos | El objetivo pide volver a preguntar solo pasado el mes |
| 3 | Pasado el mes, el bot no ve la charla anterior | Si la viera, tomaría las respuestas viejas y no volvería a preguntar |
| 4 | El link de otro asesor deja la consulta pendiente y arriba, con un aviso | Si no, el asesor nuevo no se entera de que la recibió |
| 5 | "Vuelve a escribir" = cualquier mensaje del cliente en una consulta marcada como atendida, aunque sea minutos después | Si escribió algo nuevo, hay algo sin responder. Cuando el asesor responde desde el panel, la consulta ya se marca atendida sola |

## Fuera de alcance

- **Fotos del cliente: sin cambios** (ajuste del user, 14/11). El bot las sigue viendo para responder, pero
  no se guardan, el asesor no las ve en el panel y el bot no las pide. El punto 4 del objetivo queda afuera.
- El bot no responde con audio.
- La ventana de 24 horas de WhatsApp para escribirle al cliente desde el panel no cambia: es una regla de Meta.
- El reparto por turnos, los cupos y los topes de costo no cambian.

## Impact

- **Requisito previo:** archivar en OpenSpec cuatro cambios ya publicados que tocan las mismas capacidades
  (`consultas-intervencion`, `reparto-por-turnos`, `bot-datos-del-auto`, `codigo-auto-agente`). Este
  cambio modifica reglas que hoy existen solo en esos cambios sin archivar, y sin eso no se puede archivar.
- **Backend:** `atender.js` (plazo de la consulta, historial de la consulta, link, vuelve a escribir),
  `consultas-por-auto.js` (se reemplaza), `herramientas.js` (otro auto), `consultas.service.js` (orden de la
  lista).
- **Base:** migración 084, con `sesiones.orden_at` para el orden de la lista (se rellena con `sesion_inicio`).
- **Front (`web/sea_automotores`):** sin cambios previstos. El aviso ya se muestra (`AvisoVendedor`) y el
  orden lo da el backend.
- **Métricas:** desde el deploy, cada cliente genera menos consultas (una por mes en vez de una por día o por
  auto). El Resumen y la conversión van a contar distinto.
- **Producción:** no se sube nada sin orden del user. Después del deploy, un cliente cuya consulta tenga menos
  de 30 días vuelve a esa misma consulta.
