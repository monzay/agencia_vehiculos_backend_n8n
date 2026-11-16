## ADDED Requirements

### Requirement: El permiso se guarda una sola vez
Si el cliente ya respondió al permiso y la IA vuelve a guardar la misma respuesta con la misma versión de
los términos, el sistema MUST NOT crear otro registro: MUST conservar el primero, con el `wamid` del mensaje
en que el cliente respondió. Una respuesta distinta (un "no" después de un "sí", o al revés) MUST guardarse
como un registro nuevo, igual que hoy.
<!-- id: verificacion.registrarConsentimiento -->

#### Scenario: La IA repite el mismo "sí"
- **WHEN** el cliente autorizó y, dos mensajes después, la IA vuelve a guardar un "sí"
- **THEN** queda un solo registro, con el `wamid` del mensaje en que el cliente dijo que sí
<!-- test: src/credito/verificacion.test.js › "si la IA repite el mismo sí con la misma versión de términos, queda un solo registro con el wamid del primero" -->
<!-- eval: chats simulados › P10 -->

#### Scenario: Cambia de respuesta
- **WHEN** el cliente había dicho que sí y después dice que no
- **THEN** se guarda el "no" como un registro nuevo y revoca el anterior
<!-- test: src/credito/verificacion.test.js › "si cambia de respuesta (sí y después no), se guarda un registro nuevo que revoca el anterior" -->
<!-- test: src/credito/verificacion.test.js › "el mismo no repetido tampoco crea otro registro" -->

#### Scenario: Términos nuevos
- **WHEN** el cliente repite el "sí" después de que se publicó una versión nueva de los términos
- **THEN** se guarda otra vez, con la versión nueva
<!-- test: src/credito/verificacion.test.js › "el mismo sí pero con una versión nueva de los términos se guarda otra vez" -->

### Requirement: El CUIL se consulta con la herramienta
Apenas el cliente autoriza, la asesora MUST pedir el CUIL en ese mismo mensaje, y al recibirlo MUST consultarlo
con `verificar_situacion_crediticia` antes de contestar. MUST NOT afirmar un resultado que la herramienta no dio;
después de consultar dice solo que el asesor le arma las opciones. MUST seguir también lo que devuelve
`registrar_calificacion` en lo que falta, aunque el contexto del turno no lo diga.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Autoriza y manda el CUIL
- **WHEN** el cliente dice "si, autorizo" y después manda "20-12345678-6"
- **THEN** la asesora pide el CUIL en la respuesta al "sí", lo consulta con la herramienta y dice solo que el asesor arma las opciones
<!-- test: src/agente/instrucciones.test.js › "apenas el cliente autoriza, pide el CUIL en ese mismo mensaje y guarda el permiso una sola vez por respuesta" -->
<!-- test: src/agente/instrucciones.test.js › "con el CUIL: usa SIEMPRE verificar_situacion_crediticia, no inventa que no coincide ni que falló, y después solo dice que el asesor arma las opciones" -->
<!-- eval: chats simulados › E1, P10 -->

#### Scenario: El contexto se armó antes de guardar el recibo
- **WHEN** `registrar_calificacion` devuelve el permiso primero en lo que falta
- **THEN** la asesora pide el permiso en ese mismo mensaje
<!-- test: src/agente/instrucciones.test.js › "la verificación también se pide cuando registrar_calificacion devuelve el permiso o el CUIL primero en faltan (el contexto se armó antes de guardar)" -->
<!-- eval: chats simulados › P10 -->
