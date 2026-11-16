# Respuestas del bot: reglas nuevas, recordatorio y chats simulados

> Pedido del user en `OBJETIVO.md` (2026-11-14). Este archivo lo arma Claude a partir de ese y del
> diagnóstico hecho ese día con las consultas reales de producción
> (`backups/consultas-prod-2026-11-14/DIAGNOSTICO.md`, fuera del repositorio).

## Why

El 14/11/2026 se leyeron las 14 consultas que había en producción (268 mensajes, 11 clientes reales). El bot
da bien los precios y no inventa autos, pero falla en cosas concretas:

- A un cliente que preguntó "km?" le contestó "La Captur tiene 0 km según la ficha". 18 de los 38 autos
  publicados tienen los kilómetros sin cargar y la base guarda un 0.
- A otro que preguntó "la entrega mínima" le contestó "no tengo el dato cargado". Ningún auto publicado tiene
  ese dato. Ninguno de los dos volvió a escribir.
- Cinco de los once clientes dejaron de contestar en mitad de la charla y nadie les volvió a escribir.
- Entendió "cómo sería la entrega" como "entrego un usado", anotó un usado que el cliente no tenía y lo
  sostuvo hasta el final.
- Repitió la misma pregunta cinco veces mientras el cliente preguntaba otra cosa.
- Pidió perdón por fotos que sí había mandado, y le nombró una herramienta interna al cliente
  ("buscar_similares").
- En una de cuatro charlas, después del "sí" al permiso del BCRA no pidió el CUIL.

Hoy tampoco hay una forma de ver cómo responde el modelo a un chat concreto antes de subir un cambio: la
simulación de 1200 consultas usa una IA simulada y no mide cómo razona.

## What Changes

### Reglas que pidió el user

1. **Kilómetros sin cargar.** Si el auto no tiene los kilómetros cargados, el bot lo dice con naturalidad
   ("ese dato no lo tengo a mano") e invita al cliente a verlo en la agencia. Nunca dice "0 km", "según la
   ficha" ni "no tengo el dato cargado". Para que el bot lo sepa, un usado con 0 km le llega como dato sin
   cargar.
2. **Entrega mínima sin cargar.** Si preguntan la entrega mínima y el auto no la tiene, el bot no dice que le
   falta el dato: explica que depende de la situación de cada cliente y que para decírselo necesita el
   anticipo que tiene, si entrega un vehículo y su CUIL. Después lo va preguntando, de a una cosa.
3. **Recordatorio a los 10 minutos.** Si el cliente deja sin contestar la última pregunta del bot, a los 10
   minutos recibe un mensaje corto que la retoma. Reemplaza la regla del 15/10/2026 ("al que deja de
   responder no se le escribe").

### Fallas vistas en producción que se arreglan en el mismo cambio

4. **"Entrega" es el anticipo.** El bot aprende cómo hablan los clientes, anota un usado solo si el cliente
   dice que tiene uno, y corrige lo anotado cuando el cliente lo desmiente.
5. **No repite la pregunta.** Si el cliente no la contestó y pregunta otra cosa, el bot responde eso y no
   vuelve a hacer la misma pregunta en ese mensaje.
6. **Se acuerda de lo que hizo.** En cada mensaje el bot sabe de qué autos ya mandó fotos, cuándo se acordó
   la visita y cuánto pasó desde el mensaje anterior. Deja de pedir perdón por cosas que hizo bien.
7. **Otras opciones según lo que busca.** Si el cliente pide otros modelos, se los ofrece cerca del precio
   del auto que mira.
8. **Nada interno en el texto.** El backend frena un mensaje que nombre una herramienta. De paso: un 👍
   suelto no viaja pegado a un texto, el bot entiende que "[audio]" es una nota de voz transcripta y concuerda
   el género con el auto ("lo pagás" para el Vento).
9. **Después del permiso viene el CUIL.** El permiso del BCRA y el CUIL entran en la lista de lo que falta
   preguntar, y el permiso se guarda una sola vez (plan del 11/11/2026 que estaba esperando aprobación).
10. **Nivel de razonamiento.** Hoy el bot usa el nivel más bajo. Se mide con los chats simulados si el nivel
    medio o el alto responden mejor y se elige el más bajo que pase todo.

### Cómo se verifica (pedido del user)

11. **Documento de chats simulados** (`chats-simulados.md`, en esta carpeta): 25 chats escritos como los
    escribe un cliente, con lo que el bot debe y no debe hacer en cada uno. Salen de las consultas reales,
    sin nombres ni datos personales.
12. **Script** que le manda cada chat al bot por el camino real (el mismo código que atiende WhatsApp, con
    Claude Haiku 5.5 de verdad) y arma un documento con las respuestas.
13. **Codex verifica** las respuestas de Haiku y los tests. Claude revisa cada falla que marca Codex contra
    el código y la corrige. El ciclo se repite **hasta 4 veces**; si a la cuarta siguen quedando fallas, se
    frena y se le avisa al user con la lista.

## Cómo es el bucle

| Ronda | Qué se corre | Qué revisa Codex |
|---|---|---|
| 0 | Los 25 chats contra el bot de hoy, sin tocar nada | Que los chats y sus controles estén bien armados, y qué responde mal el bot hoy |
| 1 a 4 | Los 25 chats contra el bot con los cambios | Cada respuesta contra lo que el chat pide y contra las reglas |

Cada chat se corre 2 veces por ronda, porque el modelo no responde siempre igual. Un chat pasa si pasan las
dos. El bucle termina cuando Codex no marca fallas altas ni medias y los controles automáticos dan bien.

## Dónde corren las pruebas: solo en local

- Los tests y los chats simulados corren en esta máquina, contra la base local `agencia_simulacion`, que el
  script arma de cero con un catálogo de prueba. No tocan la base de desarrollo (`agencia`) ni la de
  producción.
- Claude Haiku 5.5 es el real: cada ronda gasta centavos de la clave local (con el bot de hoy, las 14
  consultas de producción costaron USD 0,08 en total).
- No sale ningún mensaje de WhatsApp: el script guarda lo que se hubiera enviado.
- El BCRA es simulado: los CUIL de los chats son inventados.
- Codex recibe los chats simulados, las reglas y el código. No recibe conversaciones ni datos de clientes
  reales.

## Decisiones tomadas por defecto (confirmar al revisar)

| # | Decisión | Por qué |
|---|---|---|
| 1 | Para los km el bot dice "ese dato no lo tengo a mano", no "no me acuerdo" | El user pidió "no me acuerdo o algo más sutil". Si le preguntan, el bot dice que es una asistente virtual: "no lo tengo a mano" suena natural y es cierto |
| 2 | El CUIL se pide como hoy: primero el permiso con el link de privacidad, y antes el bot pregunta si tiene recibo o garante | Es la regla vigente del BCRA (`agente-credito`). El bot nombra las tres cosas que necesita y pregunta de a una |
| 3 | Si el auto sí tiene la entrega mínima cargada, el bot la sigue diciendo | Es la regla de hoy y el dato es de la agencia |
| 4 | El recordatorio sale solo si el último mensaje del bot fue una pregunta. No sale con la visita ya acordada, con la consulta derivada o tomada por un asesor, ni en una charla por una cuota | Recordarle algo a quien ya cerró o está con una persona molesta y gasta un mensaje |
| 5 | Un recordatorio por consulta cada 24 horas como máximo | Un cliente que contesta de a ratos recibiría un "¿seguís ahí?" tras cada pregunta |
| 6 | El texto del recordatorio lo escribe la IA retomando su última pregunta. Si la IA falla o no hay cupo, sale un texto fijo. Si el cliente avisó que está ocupado o que escribe después, no sale | Un texto fijo no puede retomar la pregunta |
| 7 | El recordatorio lo manda el backend directo a WhatsApp, como las respuestas del panel. n8n no cambia | El backend ya tiene esa salida; así no hay que tocar el flujo de n8n en producción |
| 8 | Cada recordatorio es un mensaje más de WhatsApp | Entra en los 1.000 gratis del mes; pasado ese tope Meta lo cobra o no lo entrega |
| 9 | Los chats tienen el guion del cliente fijo, no otro modelo haciendo de cliente | Así el mismo chat se compara igual de una ronda a la otra |
| 10 | Se suma el arreglo del CUIL (punto 9) | La regla nueva de la entrega mínima lleva al cliente justo a ese paso, que hoy falla una de cada cuatro veces |
| 11 | Migración 085: una columna nueva en `historial_mensajes` para saber de qué auto fueron las fotos de cada mensaje | Sin eso el bot no puede saber que las fotos salieron |
| 12 | "Más información" desde la web sigue recibiendo solo el precio | El user todavía no decidió cambiarlo |

## Fuera de alcance

- Qué responder a "más información" desde la web, qué decirle al que no tiene recibo ni garante, qué
  ofrecerle al que vive lejos, y los datos de la agencia (bancos, motos como parte de pago). Esperan la
  decisión del user.
- Cargar los kilómetros y la entrega mínima de cada auto: lo hace el dueño desde el panel. Con el dato
  cargado, el bot lo dice.
- La web pública también muestra "0 km" en los usados sin kilómetros. No se toca en este cambio.
- n8n, el reparto de consultas, los cupos y los topes de gasto.

## Impact

- **Backend:** `instrucciones.js` (reglas y ejemplos), `auto-publico.js` (km), `calificacion.js` y
  `herramientas.js` (permiso y CUIL en lo que falta, opciones cerca del precio), `atender.js`, `limites.js` y
  `agente.js` (contexto, revisión del texto, nivel de razonamiento), y un módulo nuevo para el recordatorio.
- **Base:** migración 085, `historial_mensajes.fotos_ref`. `sesiones.recordatorio_en` ya existe (lo usaba el
  bot viejo) y se reutiliza.
- **Herramientas de desarrollo:** `scripts/simular-chats.js` y `src/agente/simulador/chats/`.
- **Front:** sin cambios.
- **Costo:** más razonamiento y un mensaje más por cliente que deja de contestar. En Claude son centavos; en
  WhatsApp, un mensaje por recordatorio.
- **Producción:** no se sube nada sin orden del user. Al subir: la 085 antes que el backend, y revisar que
  el backend tenga `WA_TOKEN` y `WA_PHONE_NUMBER_ID` (ya los usa para responder desde el panel).
