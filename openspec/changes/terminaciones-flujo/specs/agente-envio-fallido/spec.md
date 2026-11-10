## ADDED Requirements

### Requirement: Un envío rechazado queda a la vista de un vendedor
`POST /api/agente/envio-fallido` MUST exigir el secreto del agente y recibir el número del cliente.
La última consulta de ese número MUST quedar marcada para un vendedor, con el motivo "No se pudo
enviar la respuesta por WhatsApp". Un número desconocido MUST NOT marcar nada y uno inválido MUST
responder 400.
<!-- id: agente.registrarEnvioFallido -->

#### Scenario: Envío rechazado
- **WHEN** n8n avisa que Meta rechazó el envío a un cliente
- **THEN** su última consulta queda marcada para un vendedor
<!-- test: src/services/terminaciones.test.js › "un envío fallido deja el aviso en la última consulta del cliente" -->

#### Scenario: Número desconocido o inválido
- **WHEN** el número no es de ningún cliente, o no es un número
- **THEN** no se marca nada, y el inválido responde 400
<!-- test: src/services/terminaciones.test.js › "un número desconocido no marca nada, y uno inválido se rechaza" -->
