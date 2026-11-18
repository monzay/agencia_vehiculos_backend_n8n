# Ajustes del bot a partir de los chats reales del 11 al 17/11

> Pedido del user en `OBJETIVO.md` (2026-11-17 y 2026-11-18). Este archivo lo arma Claude a partir de ese y
> del diagnóstico con las 60 conversaciones de producción (`backups/consultas-prod-2026-11-17/DIAGNOSTICO.md`,
> fuera del repositorio; tiene datos de clientes reales).

## Why

El 17/11/2026 se leyeron las 60 conversaciones de producción (1.004 mensajes). Lo que arregló
`respuestas-del-bot` (0 km, fotos fantasma, CUIL sin pedir, códigos REF) no se repite desde el 16/11. Lo que
sigue fallando en los chats del 16 y 17/11:

- **Entrega mínima circular.** Es la pregunta más frecuente: 12 de 58 chats reales, 7 de ellos del 16 y 17/11.
  El bot contesta "para decírtela necesito saber cuánto tenés de anticipo". Un cliente lo preguntó dos veces
  seguidas y otro terminó pidiendo un vendedor. Esa respuesta es el ejemplo que hoy tienen las instrucciones.
- **Se vuelve a presentar.** Cuando llega un segundo auto desde la web, repite "¡Hola! Soy José, asesor de
  ventas" un minuto después y a veces pierde la pregunta que faltaba. Después leyó "Sinanciado" como contado.
- **Opina sobre si el cliente puede financiar.** Frases como "Monotributo no es impedimento", "Trabajar con
  Uber también sirve para financiar" o "Con el garante de tu padre queda cubierto" crean expectativas que
  después el BCRA o el asesor pueden tirar abajo.
- **Lee mal mensajes cortos o no los contesta.** Ejemplos: "¿cómo podría ser el resto?", "no me lo pueden
  enviar por este medio" (lo tomó como fotos), "¿y esta?" sobre el segundo auto, y "tengo los 7 millones"
  como respuesta a si entrega un vehículo.
- **"Anotado" se sigue colando.** Pasa cuando está en la misma oración que la pregunta, como en "Perfecto,
  anotado 👍 ¿Tenés recibo…?": el filtro no la quita para no dejar el mensaje vacío.
- **Usa el nombre del perfil de WhatsApp.** Por ejemplo "¡Gracias, Mi Reina!", "El Chino" o "Mikі".

El user sumó dos pedidos:

- **El nombre lo dice el cliente.** Nunca se usa el nombre de WhatsApp. Se le pide recién después de acordar
  la visita. Si lo dijo antes, no se le vuelve a preguntar. En el panel no aparece ningún nombre que el
  cliente no haya dicho.
- **Fotos del usado.** Cuando el cliente dice que entrega un vehículo, en ese mismo mensaje el bot le pide
  fotos sin frenar la charla y sigue con la próxima pregunta. Las fotos quedan guardadas y el asesor las ve
  en la consulta.

## What Changes

- **Entrega mínima:**
  - Respuesta nueva: "No hay un monto fijo: depende de la situación de cada cliente, y el asesor te lo calcula
    en la agencia con tus datos".
  - Después sigue con lo que falte del recorrido, sin "para decírtela necesito saber cuánto tenés".
  - Las cuotas no cambian: se siguen viendo en la agencia.
- **Una sola presentación por consulta:**
  - Si el bot ya escribió en la consulta, se quita la presentación por código antes de enviar.
  - Con otro auto de la web en la misma charla, el bot da el precio del nuevo y sigue con la pregunta que
    faltaba.
- **No opina sobre la situación crediticia:**
  - Se amplía el filtro de valoraciones con las frases que aparecieron.
  - Las instrucciones suman ejemplos de monotributo, Uber, independiente y garante.
- **Filtro de "anotado" y valoraciones:** si la frase está en la misma oración que la pregunta, se quita la
  frase y queda la pregunta.
- **Cómo hablan los clientes:** se agregan las frases reales que se leyeron mal.
- **Nombre:**
  - Las fichas nuevas que llegan por WhatsApp no guardan el nombre del perfil.
  - El bot usa solo un nombre que el cliente dijo en una charla.
  - Después de la visita acordada, si no lo dijo y todavía no se le pidió, el bot se lo pide una sola vez:
    en el próximo mensaje del cliente, en vez del 👍.
  - El panel muestra el nombre que el cliente dijo en esa consulta. Si no dijo ninguno, el de la ficha (que en
    las fichas nuevas queda vacío), y si tampoco hay, "Sin nombre".
  - Los datos de producción no se tocan: las consultas que ya llegaron siguen mostrando el nombre que tienen.
- **Fotos del usado:**
  - **El pedido:** la primera vez que el cliente dice que entrega un vehículo, el bot le pide fotos en ese
    mismo mensaje. Va como pedido, no como pregunta, y sigue con la pregunta que corresponda.
  - **Sin insistir:** se pide una sola vez por consulta y el recordatorio de 10 minutos no lo retoma.
  - **Cuando llegan:** el bot agradece y sigue, sin opinar del vehículo.
  - **Dónde quedan:** todas las fotos que llegan en esa consulta en las 24 horas siguientes al pedido, hasta 10,
    se guardan en el Blob privado (el mismo de los papeles). El panel las muestra junto al usado y el asesor descarta las que
    no sean del vehículo.
- **Recordatorio de 10 minutos:** sigue saliendo una sola vez, pero solo para las preguntas que eligió el user.
  - **Se recuerdan:** qué auto busca, contado o financiado, anticipo, recibo o garante, si entrega un vehículo
    (con marca, modelo y año), quién decide y cuándo viene.
  - **No se recuerdan:** el permiso del BCRA, el CUIL, cuánto pide por el usado, las ofertas (fotos, elegir
    entre autos), el nombre, las fotos del usado ni ninguna pregunta que no se reconozca.
  - **Por qué:** hoy sale ante cualquier pregunta. En producción insistió con "¿Te quedás con el Voyage o con
    la Bora?" y con el permiso del BCRA.
- **Simulador:** se suman como casos los chats reales que fallaron y casos nuevos de nombre y fotos.
  - Corren con un Haiku 5.5 simulado que responde un guion y con la red cortada: nunca la API real.
  - Se mide antes y después, y Codex juzga cada ronda.
  - Si el Haiku real cumple las reglas que dependen solo de las instrucciones queda fuera de este cambio:
    requiere leer conversaciones de producción, y eso solo si el user lo pide.

**Regla del user para todo el cambio:** ningún test ni simulación usa la API de Claude ni otra API de
producción (WhatsApp, Groq, BCRA, Blob), porque gastan recursos limitados. Todo corre en desarrollo, sin tocar
producción.

**Queda afuera, por decisión del user:**

- **Avisos al asesor:** nada de avisos, reavisos, "estoy en la agencia" ni dar teléfonos. El bot orienta y
  lleva a la visita; el seguimiento es del asesor.
- **Modelos que no hay:** nada de alertas de stock ni de cambios en los parecidos.
- **Presupuesto y cuotas:** el bot no promete un presupuesto por WhatsApp.

## Impact

- **Specs:**
  - `agente-comportamiento`: entrega mínima, usado, defensa contra manipulación, opiniones, otro auto,
    frases, nombre y fotos.
  - `agente-conversacion`: ficha sin nombre del perfil, despedidas con 👍, limpieza final y fotos guardadas.
  - `agente-calificacion`: el nombre después de la visita.
  - `agente-recordatorio`: qué preguntas se recuerdan, y el recordatorio no pide fotos.
  - `consultas-ficha` (capacidad nueva): el nombre y las fotos del usado en el panel.
- **Código del backend:**
  - Lógica del agente: `src/agente/instrucciones.js`, `agente.js`, `atender.js`, `herramientas.js`,
    `calificacion.js`, `cierre.js`, `recordatorio.js` y `temas-preguntados.js`.
  - Ficha del cliente: el alta desde WhatsApp en `clientes.service.js`.
  - Panel: `src/mappers/consulta.mapper.js`.
  - Fotos: `src/lib/blob-privado.js` (subir al store privado).
- **Base:** migración `086` con columnas nuevas en `sesiones`:
  - cuándo se pidió el nombre y cuándo se pidieron las fotos;
  - las fotos del usado, como pathnames del Blob privado.

  No toca datos existentes.
- **Panel (`sea_automotores`):** las fotos del usado en el detalle de la consulta. El "Sin nombre" ya existe.
- **Simulador:**
  - `scripts/simular-chats.js` pasa a usar el Claude simulado (`claude-falso.js`) y el corte de red (`red.js`).
  - `chats-simulados.md` suma casos nuevos con guion del modelo y un paso de foto simulada.
  - Un Blob simulado en disco para desarrollo.
- **Gasto de las pruebas:** 0 en APIs. No se llama a Claude, WhatsApp, Groq, BCRA ni Blob.
- **Costo:** cada foto que manda el cliente la mira Claude, como hoy. Las fotos del usado suman el espacio que
  ocupan en el Blob privado.
- **Producción:** nada hasta que el user lo pida. La 086 va antes del backend y el front se publica después.
