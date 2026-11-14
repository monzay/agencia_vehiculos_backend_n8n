# Tareas — consultas-intervencion

> TDD: cada escenario `FALTA` arranca como un test que primero falla.
> Spec, código y tests entran en el mismo commit (`openspec/project.md` › Reglas para crecer).

## Fase 1 — El bot no responde con la conversación tomada (backend) ✅
- [x] Test: con `bot_pausado = true` se guarda el entrante y no se llama a Claude, no se envía, no se gasta cupo
- [x] Test: reintento del mismo `wamid` con la sesión tomada no se guarda dos veces
- [x] Implementar en `agente/atender.js`: chequeo de `bot_pausado` dentro de `deAUno`, tras resolver cliente y sesión → corta guardando entrantes (`enPausa`)
- [x] `agente/pasos.js`: agregar `PASO_HUMANO = "humano"`

## Fase 2 — El chat completo en el detalle (backend) ✅
- [x] Test del mapper: `autor = cliente | bot | humano` según `direccion` y `paso_nodo`
- [x] Test: `obtenerConsulta` devuelve entrantes + salientes ordenados por fecha, y conserva las respuestas estructuradas
- [x] Implementar en `services/consultas.service.js` y `mappers/consulta.mapper.js` (campo nuevo `chat`, conserva `respuestas` y `mensajes`)

## Fase 3 — Envío saliente + endpoints (backend) ✅
- [x] Test de `agente/whatsapp-envio.js` con `fetch` mockeado: cuerpo de texto de la Cloud API; falla claro si falta `WA_TOKEN` o `WA_PHONE_NUMBER_ID`
- [x] Test: responder como persona guarda saliente `humano` solo si Meta aceptó; si rechaza, error y sin saliente fantasma
- [x] Test: ventana de 24 h (abierta permite; cerrada no envía y avisa)
- [x] Test: intervenir pone `bot_pausado = true` y registra quién; devolver lo pone en `false`; 404 si la sesión no existe; 400 texto inválido
- [x] Implementar `agente/whatsapp-envio.js` (usa `enviosDeRespuesta`), funciones de servicio, endpoints en `controllers/consultas.controller.js` y rutas en `routes/consultas.routes.js` (con auth)
- [x] `.env.example`: documentar `WA_TOKEN` y `WA_PHONE_NUMBER_ID`
- [ ] (pendiente) test de ruta del 401 propio de estos endpoints; hoy lo cubre el `requireAuth` compartido

## Fase 4 — Chat e intervención en el panel (front) ✅
- [x] `components/panel/secciones/chat-consulta.jsx`: hilo de burbujas (cliente / bot / humano), composer, botón "Devolver al bot", aviso de ventana de 24 h
- [x] `components/panel/secciones/consultas.jsx`: reemplazar `panelRespuestas` por `<ChatConsulta>` en un panel lateral que se superpone a todo (`components/panel/ui/panel-lateral.jsx`, z-[60]), en desktop y móvil. Falta probarlo visualmente
- [x] `lib/api.js`: `enviarMensajeConsulta`, `devolverABot` (`obtenerConsulta` ya ampliado en Fase 2)
- [x] Polling del detalle (4 s) mientras el chat está abierto; `npm run build` en verde

## Fase 5 — Verificación
- [ ] Todos los `test: FALTA` del delta reemplazados por el ancla del test real
- [ ] `node --test` en verde (cobertura ≥ 80 % en lo nuevo)
- [ ] `npm run build` del front en verde
- [ ] Prueba E2E del flujo: ver chat → tomar → responder → el cliente responde (bot callado) → devolver al bot
- [ ] `openspec archive` integra el delta a `specs/`
