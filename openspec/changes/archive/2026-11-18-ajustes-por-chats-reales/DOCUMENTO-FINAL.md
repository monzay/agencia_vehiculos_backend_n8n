# Documento final — ajustes-por-chats-reales

> Cambio pedido por el user el 17 y 18/11/2026 (`OBJETIVO.md`), a partir de las 60 conversaciones de producción del
> 11 al 17/11. Se aprobó el 18/11/2026 y se terminó ese mismo día en local, en las ramas
> `feat/ajustes-por-chats-reales` del backend y del panel. Nada está en producción.

## 1. Qué cambia para el cliente

| Situación (de los chats reales) | Antes | Ahora |
|---|---|---|
| "¿Con cuánto lo retiro?" / "¿cuál es la entrega mínima?" | "Para decírtela necesito saber cuánto tenés de anticipo…" (en círculo) | "No hay un monto fijo: depende de la situación de cada cliente, y el asesor te lo calcula en la agencia con tus datos." y sigue con lo que falta |
| Llega un segundo auto desde la web en la misma charla | "¡Hola! Soy José, asesor de ventas" otra vez | Da el precio del auto nuevo y sigue con la pregunta que faltaba; si el modelo igual se presenta, el sistema saca la frase |
| El cliente cuenta que es monotributista, que trabaja de Uber o quién es su garante | "Monotributo no es impedimento", "con el garante queda cubierto" | Acusa recibo y sigue; esas frases se quitan antes de enviar |
| "Perfecto, anotado 👍 ¿Tenés recibo…?" | Se colaba "anotado" | Sale solo la pregunta |
| "Sinanciado", "recién moto también?", "¿cómo podría ser el resto?", "por este medio", "tengo los 7 millones" a la pregunta del usado | Se entendían mal o quedaban sin respuesta | Están explicadas en las instrucciones del bot |
| El nombre | Usaba el del perfil de WhatsApp ("¡Gracias, Mi Reina!") | Nunca el del perfil. Si el cliente no lo dijo, después de acordar la visita se lo pide una vez, en el mensaje siguiente; si contesta "dale" o "gracias" sin darlo, 👍 y no insiste |
| Quién decide | "¿Lo decidís vos solo…?" | "¿Lo decidís por tu cuenta o lo consultás con alguien?" |
| El cliente dice que entrega un vehículo | Solo marca, modelo, año y cuánto pide | En ese mismo mensaje le pide fotos ("Si podés, pasame unas fotos del Fox"), una sola vez, y sigue con la pregunta |
| Manda 2 o 3 fotos seguidas | Una respuesta por foto (mensajes pagos) | Una sola respuesta: "gracias", sin opinar del auto |
| Deja sin contestar una pregunta | El recordatorio salía con cualquier pregunta (incluido el permiso del BCRA y "¿te quedás con X o Y?") | Sale solo con: qué auto busca, contado o financiado, anticipo, recibo o garante, el usado (marca, modelo y año), quién decide y la visita |

**En el panel:**
- La consulta muestra el nombre que dijo el cliente; si no dijo ninguno, "Sin nombre".
- Las fotos del usado aparecen en "Datos de la consulta", en miniatura, y se abren en grande en otra pestaña.
- Las consultas que ya llegaron siguen mostrando el nombre que tenían: no se tocaron datos de producción.

**Lo que quedó afuera por decisión del user:** avisos al asesor por derivación, "estoy en la agencia", dar
teléfonos, alertas de stock, cambios en los autos parecidos y prometer un presupuesto por WhatsApp. El bot orienta
y lleva a la visita; el seguimiento es del asesor.

## 2. Decisiones

**Del user (ver `OBJETIVO.md`):**
- Entrega mínima con la respuesta A.
- Las cuotas siguen siendo "se arma en la agencia".
- El nombre se pide en el mensaje siguiente a la visita, y el panel muestra "Sin nombre".
- No se tocan datos de producción.
- Fotos del usado: pedirlas una vez, guardarlas, mostrarlas y agradecer sin opinar.
- La lista de preguntas que se recuerdan.
- Ninguna prueba usa la API de Claude ni otras APIs de producción.

**Tomadas en el camino y anotadas en el plan:**

| # | Decisión | Por qué |
|---|---|---|
| 1 | Se guardan todas las fotos que llegan en las 24 h siguientes al pedido, hasta 10 por consulta; el asesor descarta las que no son del usado | El bot no puede saber con certeza cuáles son del vehículo |
| 2 | Las fotos esperan en la ráfaga como un texto y se responden una sola vez; al modelo le llegan hasta 3 | Sin esto, 3 fotos eran 3 respuestas pagas |
| 3 | El nombre se pide recién en el mensaje siguiente a la confirmación de la visita, y va primero en lo que falta | El user descartó pedirlo en el mismo mensaje que confirma la visita |
| 4 | `nombre_pedido_at` se marca solo si el texto que salió pidió el nombre | Si el modelo no lo pidió, queda para el mensaje siguiente |
| 5 | Después del pedido del nombre, un "dale" o "gracias" es un 👍 sin IA | No insistir y no gastar mensajes |
| 6 | Un cliente de antes que vuelve sin decir su nombre sigue mostrando en el panel el nombre de su ficha, pero el bot no lo usa | No tocar datos de producción |
| 7 | El nombre, la ficha y las marcas de fotos los escribe el usuario del backend, no `agente_ia` | `agente_ia` no tiene permiso de escritura sobre esas columnas; la 086 no suma permisos |

## 3. Cómo se hizo y cómo se verificó

- **Ciclo por tarea:**
  - Los tests se escribieron primero: los de las tareas 1 a 5 y 9 los escribió Claude, y los de las tareas 6 a 8,
    Sonnet con la especificación de Claude.
  - Codex revisó los tests y se congelaron.
  - Sonnet 5.5 escribió el código.
  - Codex revisó el diff; Claude verificó cada hallazgo contra el código y anotó cuáles aplicaban.
  - El detalle está en `BITACORA.md`, y las 8 rondas del plan en `REVISION-PLAN.md`.
- **Sin ninguna API real:**
  - Las conversaciones simuladas usan un Haiku 5.5 simulado con guion por turno, la red cortada (`red.js`
    precargada) y el Blob simulado en disco.
  - Toda la suite de tests corre con la barrera de red precargada.
  - Costo de IA en todo el cambio: US$ 0, con 0 intentos de conexión fuera de la máquina en todas las rondas.
- **Simulación:** 14 conversaciones nuevas (X1 a X14) armadas con los chats reales. La ronda 0 (el bot de hoy) falla
  en 8; la ronda 5 (con el cambio) pasa las 14. La tabla está en `BITACORA.md` › Tarea 10.
- **Suite del backend:** 1942 de 1944. 1 salteado y 1 que falla, el de anclas de `importar-lista-por-etapas`,
  ajeno a este cambio.
- **Panel:** tests 3 de 3, build sin errores, y prueba en el navegador local con una consulta de prueba sin nombre
  y con 2 fotos (backend sin claves, con la barrera de red y el Blob simulado). Los datos de prueba se borraron.
- **Migración 086:** probada dos veces sobre una base temporal local con el `sql_mode` ANSI de producción. Está
  aplicada solo en la base local de desarrollo.

## 4. Errores encontrados en el camino (y corregidos)

- El script de conversaciones simuladas dejaba pasar a Anthropic a propósito (se hizo para el Haiku real). Se
  cambió por el corte total.
- El primer test del corte de red, corrido sin la barrera, mandó un pedido sin clave a `api.anthropic.com`.
  Anthropic lo rechaza sin consumir nada. Desde entonces, sin la barrera, ese test no intenta conectarse.
- X14 no probaba lo que decía: el recordatorio permitido gastaba el cupo de 24 h antes del excluido. Se reordenó.
- El filtro de presentación cortaba oraciones ("Soy José, asesor de ventas y te cuento…"). Ahora quita la
  presentación solo si termina ahí.
- El 👍 después del pedido del nombre dependía de una ventana de 1 segundo. Ahora usa una condición exacta.
- `nombre_pedido_at` se marcaba aunque el modelo no hubiera pedido el nombre. Ahora no.
- `exigirBlobSimulado` no rechazaba `NODE_ENV=production`. Ahora sí.
- En el panel, la política de contenido no dejaba ver las fotos del Blob simulado en desarrollo (`http://localhost`).
  Se agregó solo fuera de producción.

## 5. Lo que quedó sin resolver o como límite

- **Lo que no mide el modelo simulado:** si el Haiku real obedece las reglas que dependen solo de las
  instrucciones (la respuesta A, las frases mal leídas, pedir el nombre con una pregunta corta). Para eso hay que
  leer conversaciones de producción después del deploy, y solo si el user lo pide, como el 17/11.
- **Fotos del mismo mensaje del pedido:** las que llegan junto con "tengo un Fox para entregar" no se guardan,
  porque el pedido todavía no salió. La spec dice "después del pedido".
- **ESLint en el panel:** `chat-consulta.jsx` ya tenía un error de ESLint (`react-hooks/set-state-in-effect`), y
  sigue igual.
- **Escenario sin test propio:** "Venció la URL" (consultas-ficha). Se cumple porque cada vez que se abre el detalle
  las fotos se firman de nuevo, pero ningún test abre el detalle dos veces. Las otras 66 anclas apuntan a su test.
- **Test de anclas:** `src/openspec-anclas.test.js` falla por anclas de `importar-lista-por-etapas`, otro cambio.

## 6. Para pasar a producción (solo con la orden del dueño)

1. Respaldo de la base de producción.
2. Migración `prisma/migrations_manual/086_nombre_y_fotos_del_usado.sql`. Agrega 3 columnas nulas a `sesiones`,
   no toca datos ni permisos y se puede correr dos veces. Va **antes** del backend.
3. Backend de la rama `feat/ajustes-por-chats-reales`, después de mergear a `main`.
4. Variables del backend en producción:
   - **`BLOB_DOCUMENTOS_TOKEN`:** el backend ya la usa para firmar los papeles; verificar que esté en
     `backend.env`. Sin ella las fotos del usado no se suben (la respuesta al cliente sale igual) y el panel no
     las muestra.
   - **`BLOB_SIMULADO`:** NO se pone en producción. Si se pusiera, se ignora.
   - **`RECORDATORIO_MINUTOS`:** sin cambios.
5. Panel de la rama `feat/ajustes-por-chats-reales` del front (deploy automático de Vercel al mergear a `main`),
   después del backend.
6. n8n no cambia.
7. Después del deploy:
   - probar desde el celular una charla con un usado y dos fotos, y que acuerde la visita;
   - `openspec archive ajustes-por-chats-reales`;
   - actualizar la bóveda;
   - si el user lo pide, exportar las conversaciones de la semana siguiente y compararlas con el diagnóstico del
     17/11.

**Costo:** baja. Las fotos juntas pasan de una respuesta por foto a una sola, y el recordatorio sale en menos
casos. Lo único que suma es el espacio de las fotos del usado en el Blob privado (hasta 10 por consulta).
