# Revisión de los chats simulados — respuestas-del-bot

En cada ronda Codex revisa las respuestas de Haiku y los tests; Claude verifica cada hallazgo contra la
transcripción y el código, y corrige. Máximo 4 rondas después de la ronda 0.

## Ronda 0 — 2026-11-15 (bot sin cambios)

- Controles automáticos: 16 de 25 chats pasan en las 2 repeticiones. Fallan K1, K2, E1, R1, R2, P3, P4, P10 y N5.
- Codex: 13 de 50 conversaciones pasan. No aprueba.
- Costo de IA: USD 0,088. Mensajes de WhatsApp que hubiera cobrado Meta: 171.
- Fallaron K1, R1 y R2, como pedía el criterio de la tarea 2.

Fallas del bot que marcó Codex y que cubren las tareas 3 a 9: 0 km y "ficha" (K1, K2); "no lo tengo cargado" y
permiso/CUIL fuera de orden (E1, P10); "entrega" entendida como retiro o como usado (E3, P1); sin recordatorio
(R1, R2); pregunta repetida (K1, P3); fotos reenviadas y "no las mandé" (P4); opciones caras (P3, P4);
corrige fechas y dice que anotó datos (P7); 👍 suelto (N3); género (N5); dos preguntas en un mensaje (E2, N2, P1).

Hallazgos sobre los tests:

| # | Chat | Hallazgo de Codex | Verificación de Claude | Qué se hizo |
|---|---|---|---|---|
| 1 | K1 | El control de repetición detecta mal | No es correcto: el control falló, que es lo esperado | Nada |
| 2 | E1 | "no lo tengo cargado en el sistema" pasa el control de texto | Correcto | El control pasa a prohibir "cargado" (también en K1, K2 y E3) |
| 3 | R2 | El cliente escribe justo a los 10 minutos: no corresponde recordatorio | El script revisa el recordatorio a los 10 minutos, antes del mensaje; igual quedaba ambiguo | La espera pasa a 12 minutos |
| 4 | P10, E1 | El "Si" responde a otra pregunta y no hay permiso que guardar | Es la falla del bot de hoy (pregunta por el usado antes del permiso), no del test: la tarea 5 pone el permiso antes | Nada |
| 5 | P4 | El control de fotos no distingue el auto | Cierto; lo juzga Codex en la transcripción | Se suma prohibir "REF": el bot le escribió "REF #65" al cliente |
| 6 | N3 | No controla el 👍 suelto | Correcto | Control "termina con 👍: no" |
| 7 | P8 | No verifica el precio de contado de la Duster | La Duster de la simulación no tiene precio de contado: decir que no lo tiene es correcto | Nada |

## Ronda 1 — 2026-11-15 (con las tareas 3 a 10)

- Controles automáticos: 22 de 25 chats pasan en las 2 repeticiones. Fallan E1, P4 y P10 (cada uno en una de las dos pasadas).
- Codex: 22 de 50 conversaciones pasan (en la ronda 0, 13). No aprueba.
- Costo de IA: USD 0,103.

| # | Chat | Hallazgo de Codex | Verificación de Claude | Qué se hizo |
|---|---|---|---|---|
| 1 | E1, P10 | Le dice al cliente un resultado de la consulta al BCRA ("el CUIL no coincide", "no pude hacerla") y que un vendedor lo va a contactar sin haber derivado | Correcto: en esos turnos la herramienta que figura es `registrar_consentimiento`, no la de verificar | Arreglo en curso: usar siempre la verificación al recibir el CUIL y no afirmar nada que la herramienta no dijo |
| 2 | P10 | Tras el recibo pregunta por el usado antes del permiso | Correcto: sigue el orden del contexto, armado antes de guardar el recibo | Arreglo en curso: el permiso figura en el orden desde antes |
| 3 | P4 | Código "REF" en el texto | Correcto | Arreglo en curso: se quita por código |
| 4 | E1, R2, varios | Opina sobre el anticipo ("buena base", "muy buen anticipo"), pese a la regla de no decir si alcanza | Correcto | Para la ronda 2: regla explícita |
| 5 | P1, E2, P4 | Dos preguntas en un mismo mensaje | Correcto | Para la ronda 2: regla más firme |
| 6 | K2 | Tras "tengo 8 millones para entregar" vuelve a preguntar la forma de pago | Correcto: quien habla de anticipo financia | Para la ronda 2: regla |
| 7 | P6 | Tras el audio no deja anotado el auto | Correcto | Para la ronda 2: regla (anotar el auto cuando el cliente lo nombra) |
| 8 | R1 | El recordatorio saluda de nuevo o presiona | Parcial: revisar los textos | Para la ronda 2: ajustar la línea del recordatorio |
| 9 | E1, P10, R4 | "La herramienta devuelve vacío": afirma horarios o consultas sin respaldo | No es correcto: el registro de herramientas resume el resultado y Codex no lo ve | Para la ronda 2: la transcripción de la simulación muestra el resultado completo de cada herramienta |
| 10 | P3 | Inventa que el Gol Trend tiene 3 puertas | No es correcto: la versión del 2015 dice "3 puertas" en el catálogo | Nada |
| 11 | E3 | "Inventa" que financia | No es correcto: la regla pide guardar que financia cuando pregunta por la entrega | Nada |
| 12 | P8 | Mantiene "de contado" en la consulta por otro auto | No es correcto: es lo que pide el chat | Nada |
| 13 | P6, P1 | Agrega la pregunta del recorrido a quien solo preguntó el precio | No es correcto: es la regla vigente del recorrido | Nada |
| 14 | P4 (test) | El control "REF" mira también el mensaje del cliente | No es correcto: el control mira solo los mensajes del bot; el bot escribió el código | Nada |
| 15 | N2, N4, P7 (tests) | Faltan controles automáticos | Los juzga Codex con el "Debe" y "No debe" | Nada |

## Ronda 2 — 2026-11-15

- Controles automáticos: 25 de 25 chats pasan en las 2 repeticiones.
- Codex: 29 de 50 conversaciones pasan (ronda 0: 13; ronda 1: 22). No aprueba.
- Costo de IA: USD 0,114.

| # | Chat | Hallazgo de Codex | Verificación de Claude | Qué se hizo |
|---|---|---|---|---|
| 1 | P3 | Dice que el Gol Trend 2019 "es de 4 puertas" | Correcto: el dato no está en el catálogo | Para la ronda 3: regla y ejemplo de no deducir datos que la ficha no trae |
| 2 | E1, R2 | Llama "buena base" al anticipo | Correcto: la regla escrita no alcanzó | Para la ronda 3: se quita por código la oración que valora el anticipo |
| 3 | P1, P10 | "¡Anotado…!", "Ya dejé registrado todo" | Correcto | Para la ronda 3: se quita por código |
| 4 | P8 | En la consulta por la Duster no da su precio de lista | Correcto | Para la ronda 3: regla (una consulta nueva de la web siempre recibe el precio de lista) |
| 5 | P7 | Ofrece coordinar de nuevo sin los horarios | Correcto, menor | Para la ronda 3: regla |
| 6 | P4 | Mandó también las fotos del auto que no le pidieron | Correcto | Para la ronda 3: regla (solo las fotos del auto pedido) |
| 7 | N3 | Tras derivar invita a seguir charlando | Correcto, menor | Para la ronda 3: regla |
| 8 | E2, K3, P3 | Dos preguntas, o pregunta del recorrido fuera de orden | Correcto en E2 | Para la ronda 3: regla reforzada |
| 9 | N4 | Un precio salió como "$19.800.£000" | Es un error de tipeo del modelo, en 1 de 50 | Para la ronda 3: se corrige por código un precio con símbolos extraños |
| 10 | R3 | "👍 suelto" al final de una frase | No es correcto: un emoji al final de la oración no es el 👍 suelto de la regla | Nada |
| 11 | K2 | "Con el anticipo que tenés lo vemos en la agencia" sugiere que alcanza; no repite que no tiene los km | No es correcto: no dice que alcanza, y sobre los km dice que se ven en persona, sin inventar | Nada |
| 12 | Tests | Faltan controles automáticos para lo que juzga Codex | Es el diseño: los controles son la red de abajo | Nada |

## Ronda 3 — 2026-11-15

- Controles automáticos: 24 de 25 (K1 falló en una de las dos pasadas).
- Codex: 32 de 50 conversaciones pasan (13 → 22 → 29 → 32). No aprueba. Una sola falla alta, descartada.
- Costo de IA: USD 0,104.

| # | Chat | Hallazgo de Codex | Verificación de Claude | Qué se hizo |
|---|---|---|---|---|
| 1 | K1 | Repite la pregunta de la forma de pago tras los km | Correcto: el freno por código no la quitó cuando la pregunta va en la misma línea, después de un emoji | Para la ronda 4: arreglar el freno |
| 2 | P3 | Dice que no tiene a mano las puertas del Gol Trend 2015, y la versión dice "3 puertas" | Correcto: la regla nueva de no deducir datos se pasó de largo | Para la ronda 4: lo que dice la versión es un dato |
| 3 | P7 | Vuelve a coordinar sin decir los horarios | Correcto, por segunda ronda | Para la ronda 4: el contexto avisa que la visita propuesta ya pasó y pide los horarios |
| 4 | P1 | Dos preguntas en un mensaje; duda de un auto que ya había mostrado | Correcto, menor | Para la ronda 4: refuerzo |
| 5 | P5 | No ofrece parecidos al auto que no hay, solo el catálogo | Correcto, menor | Para la ronda 4: regla |
| 6 | R3 | Tras "más tarde te escribo" le recuerda el anticipo | Correcto, menor | Para la ronda 4: regla |
| 7 | N5 | Agrega la versión al precio | Correcto según la regla vigente (solo el precio), menor | Para la ronda 4: regla |
| 8 | N4 | "El costo de la agencia es algo interno" sería divulgar información interna | No es correcto: se niega a darlo | Nada |
| 9 | P8 | Dice que no tiene el precio de contado de la Duster | No es correcto: ese precio no está cargado | Nada |
| 10 | P3 | Repite la pregunta del recibo en la tercera respuesta | No es correcto: la regla permite retomarla una vez más adelante | Nada |
