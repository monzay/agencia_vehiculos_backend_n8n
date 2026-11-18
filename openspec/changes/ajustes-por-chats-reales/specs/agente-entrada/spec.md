## MODIFIED Requirements

### Requirement: Mensajes en ráfaga se responden una sola vez
El sistema MUST esperar 4 segundos después de cada mensaje de un número, también si trae una foto. Si en ese
tiempo llegan otros del mismo número, MUST responder una sola vez, al último, con todos los textos juntos y en
orden y con las fotos de todos. Los anteriores no responden nada. Un mensaje con audio MUST salir sin esperar,
junto con lo que ya estaba esperando. Cada parte se guarda con su propio id.
<!-- id: rafagas.juntarRafaga -->
<!-- observacion: riesgo aceptado y documentado en el código: si el backend se reinicia durante la espera, esos mensajes se pierden -->

#### Scenario: Un solo mensaje
- **WHEN** llega un solo mensaje y la espera es 0
- **THEN** sigue como está, sin esperar
<!-- test: src/agente/rafagas.test.js › "un mensaje solo sigue como está (sin esperar si la espera es 0)" -->

#### Scenario: Varios mensajes seguidos
- **WHEN** llegan "hola", "vi la amarok" y "sigue disponible?" dentro de la espera
- **THEN** responde el último, una sola vez, con los tres juntos
<!-- test: src/agente/rafagas.test.js › "mensajes seguidos del mismo número: los responde el último, todos juntos" -->
<!-- test: src/agente/atender.test.js › "mensajes seguidos: se responde una sola vez, a todos juntos, y se guarda cada uno" -->
<!-- test: src/routes/agente.routes.test.js › "un mensaje que se juntó con otro de la misma ráfaga no responde (responde el último)" -->

#### Scenario: Mensaje con foto o audio
- **WHEN** llega un audio, o una foto
- **THEN** el audio sale ya, con lo que estaba esperando; la foto espera como un texto, para juntarse con las que lleguen después
<!-- test: FALTA -->

#### Scenario: Fotos seguidas
- **WHEN** el cliente manda dos fotos de su usado una detrás de la otra, dentro de la espera
- **THEN** el bot responde una sola vez, y el lote lleva las dos fotos (al modelo le llegan hasta 3, las últimas; para guardar, todas)
<!-- test: FALTA -->
<!-- eval: chats simulados › X12 -->

#### Scenario: Números distintos
- **WHEN** escriben dos números distintos al mismo tiempo
- **THEN** sus mensajes no se mezclan
<!-- test: src/agente/rafagas.test.js › "números distintos no se mezclan" -->

#### Scenario: Después de responder
- **WHEN** ya se respondió una ráfaga
- **THEN** el próximo mensaje arranca una ráfaga nueva
<!-- test: src/agente/rafagas.test.js › "después de responder, el próximo mensaje arranca una ráfaga nueva" -->
