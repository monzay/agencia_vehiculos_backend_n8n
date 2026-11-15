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
