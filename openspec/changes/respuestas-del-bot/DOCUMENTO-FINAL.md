# Documento final — respuestas-del-bot

> Cambio pedido por el user el 14/11/2026 (`OBJETIVO.md`), aprobado el 15/11/2026 y terminado ese mismo día en
> local, en la rama `feat/respuestas-del-bot`. Nada está en producción.

## 1. Qué cambia para el cliente

**Las tres reglas que pidió el user:**

| Situación | Antes | Ahora |
|---|---|---|
| Pregunta los km de un auto que no los tiene cargados | "La Captur tiene 0 km según la ficha" | "Los km de la Captur no los tengo a mano en este momento, lo podés ver en persona cuando vengas a la agencia" |
| Pregunta la entrega mínima y el auto no la tiene | "No tengo el dato cargado" | "La entrega depende de la situación de cada cliente. Para decírtela necesito saber cuánto tenés de anticipo, si entregás un vehículo como parte de pago y tu CUIL. ¿Con cuánto de anticipo contás?" |
| Deja sin contestar una pregunta | Nadie le volvía a escribir | A los 10 minutos recibe un mensaje corto que retoma la pregunta, por ejemplo "¿Con cuánto de anticipo contás más o menos?". Uno por consulta cada 24 horas como máximo |

**Fallas vistas en producción el 14/11 que también se arreglaron:**

- Entiende que "entrega", "con cuánto lo retiro" o "tengo 8 millones para entregar" es el anticipo, y no anota un
  usado que el cliente no ofreció. Si el cliente desmiente algo anotado, lo corrige.
- No repite la misma pregunta cuando el cliente pregunta otra cosa (si el modelo igual la repite, el sistema la
  saca antes de enviar).
- Se acuerda de qué fotos mandó y de cuándo se acordó la visita: deja de pedir perdón por cosas que hizo bien.
- Si el cliente no pudo venir, coordina de nuevo diciendo los días y horarios de la agencia.
- Pide el permiso del BCRA justo después del recibo o garante, el CUIL apenas el cliente autoriza, y no guarda el
  permiso dos veces.
- Ofrece otros autos cerca del precio del que mira, no una Hilux a quien busca algo económico.
- No le escribe al cliente nombres internos ni códigos ("buscar_similares", "REF #65"), no opina sobre su anticipo
  ("muy buen anticipo"), no anuncia que anotó sus datos y concuerda el género con el auto ("lo pagás" para el Vento).

**Lo que no cambia** (decisión del user, 15/11): al que pide "más información" desde la web le sigue respondiendo
el precio de lista y la pregunta de cómo paga.

## 2. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| 1 | Para los km dice "no lo tengo a mano", no "no me acuerdo" | Es cierto y suena natural; si le preguntan, el bot dice que es una asistente virtual |
| 2 | El CUIL se pide con el permiso y el link de privacidad antes, como exige la regla del BCRA | Regla vigente de `agente-credito` |
| 3 | El recordatorio sale solo si el último mensaje del bot preguntó algo, entre 10 y 60 minutos después, y no si la visita está acordada, la consulta está derivada o tomada por un asesor, o la charla es por una cuota | No molestar a quien ya cerró o está con una persona |
| 4 | El texto del recordatorio lo escribe la IA retomando la pregunta; si la IA falla, sale "¿Seguís por ahí? Cuando puedas, contame y seguimos 🙂", salvo que el cliente haya avisado que escribe después o se haya despedido | Un texto fijo no puede retomar la pregunta |
| 5 | El recordatorio lo manda el backend directo a WhatsApp; n8n no cambia | El backend ya tiene esa salida (la usan las respuestas del panel) |
| 6 | El nivel de razonamiento queda en bajo | Medio y alto no pasaron más chats y costaron más (`simulacion/esfuerzo.md`) |
| 7 | Lo que el modelo no cumplió por instrucciones se resolvió por código: la pregunta repetida, los nombres internos, los códigos REF, las valoraciones del anticipo y los anuncios de "anotado" se quitan del texto antes de enviarlo | En las rondas, el modelo siguió haciéndolo aunque las reglas estaban escritas |

## 3. Cómo se hizo y cómo se verificó

- **Chats simulados** (`chats-simulados.md`): 25 clientes inventados, escritos como escriben los clientes reales,
  con lo que el bot debe y no debe hacer y controles automáticos.
- **Script** `scripts/simular-chats.js`: le manda cada chat al bot por el camino real (el mismo código que atiende
  WhatsApp) con Claude Haiku 5.5 de verdad, en una base de simulación propia, sin WhatsApp ni BCRA reales.
- **Codex** revisó el plan, cada ronda de respuestas y el código. Cada hallazgo se verificó contra la transcripción
  y el código; los que no eran correctos quedaron anotados con el motivo (`REVISION-PLAN.md`, `REVISION-CHATS.md`).
- **Código** escrito por Sonnet 5.5 con los tests primero; revisión, verificación y especificación por Claude.

| Ronda | Controles automáticos | Conversaciones que aprobó Codex | Costo de Claude |
|---|---|---|---|
| 0 (bot sin cambios) | 16 de 25 | 13 de 50 | USD 0,088 |
| 1 | 22 de 25 | 22 de 50 | USD 0,103 |
| 2 | 25 de 25 | 29 de 50 | USD 0,114 |
| 3 | 24 de 25 | 32 de 50 | USD 0,104 |
| 4 | 25 de 25 | 40 de 50 | USD 0,108 |
| Horarios (extra) | P7, R4 y P9: 9 de 9 | P7 resuelto | — |
| Verificación final | 25 de 25 | — | USD 0,056 |

En la ronda 4 las 4 fallas altas de Codex no eran reales (leyó una consulta al BCRA como hecha después del mensaje,
cuando fue en el mismo turno).

- **Tests:** 1729 en total, 1728 pasan. El que falla es el de anclas, por otro cambio (`importar-lista-por-etapas`),
  y ya fallaba antes. Las 66 reglas nuevas de este cambio apuntan a su test con el nombre exacto.
- **OpenSpec:** `openspec validate respuestas-del-bot --strict` pasa.
- **No se corrió** la comparación con los 5 clientes simulados de antes (`scripts/simular-ventas.js`): usa la base de
  desarrollo, donde ahora corre el recordatorio del backend local. Los 25 chats la reemplazan con más casos.

## 4. Errores encontrados en el camino (y corregidos)

- El simulador usaba el mismo CUIL inventado en todos los chats y el backend no deja consultar un CUIL de otra
  ficha: parecía que el bot inventaba "el CUIL no coincide". Se corrigió el simulador.
- El freno de la pregunta repetida no la quitaba si iba en la misma línea después de un emoji. Corregido.
- La regla de no deducir datos hizo que el bot dijera que no sabía las puertas de un auto cuya versión dice
  "3 puertas". Se aclaró que lo que dice la versión es un dato.
- Revisión de código: un mensaje del cliente que todavía estaba esperando para juntarse con otros (4 segundos)
  podía no frenar el recordatorio; también casos borde con despedidas, mayúsculas y la búsqueda de consultas.
  Corregidos con su test.

## 5. Lo que quedó sin resolver (menor, aceptado por el user el 15/11)

- A veces hace dos preguntas en un mensaje, o la del recorrido fuera de orden.
- A veces agrega versión y combustible cuando solo le preguntan los km.
- En una pasada dijo "ya tengo todo lo que necesito" y después siguió preguntando.
- Cierra a veces con "cualquier cosa escribime" o un emoji al final de la frase.
- Con varias instancias del backend, el recordatorio y el permiso del BCRA podrían duplicarse. Hoy el backend es
  un solo proceso a propósito (igual que las ráfagas y la cola por número).

## 6. Para pasar a producción (solo con la orden del dueño)

1. Respaldo de la base de producción.
2. Migración `prisma/migrations_manual/085_historial_fotos_ref.sql` (se puede correr dos veces; sin permisos
   nuevos). Va **antes** del backend.
3. Backend de la rama `feat/respuestas-del-bot`, después de mergear a `main`.
4. Variables del backend en producción:
   - `WA_TOKEN` y `WA_PHONE_NUMBER_ID`: ya están (las usan las respuestas del panel). Sin ellas el recordatorio no
     arranca y lo avisa en el log.
   - `RECORDATORIO_MINUTOS`: opcional, por defecto 10; con 0 se apaga.
5. El front y n8n no cambian.
6. Después: probar desde el celular una charla real que quede sin contestar 10 minutos, `openspec archive
   respuestas-del-bot` y actualizar la bóveda.

**Costo:** cada recordatorio es un mensaje más de WhatsApp. Entra en los 1.000 gratis del mes; pasado ese tope Meta
lo cobra (USD 0,026 en Argentina) o, sin medio de pago cargado, no lo entrega. Sale dentro de la hora del último
mensaje del cliente, así que está dentro de la ventana de 24 horas de Meta.

**En local:** el backend de desarrollo ya tiene el recordatorio activo porque el `.env` local tiene `WA_TOKEN`.
Para que no escriba mientras se prueba, `RECORDATORIO_MINUTOS=0`. Falta correr `npx prisma generate` con el
backend de desarrollo apagado (el archivo del motor estaba bloqueado); los tests y la simulación no lo necesitan.
