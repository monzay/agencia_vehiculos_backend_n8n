# OBJETIVO

> Palabras del user en el chat del 2026-11-17 y 2026-11-18, copiadas tal cual. Este archivo es del user:
> Claude no lo modifica. Las partes entre comillas o con números que el user pegó son texto de Claude que
> el user citó para responder.

## Primer mensaje (2026-11-17)

toma  el ese archivo   y analisalo para ver  los erroes del bot  en su forma de constestar   en base las respreguntas del cliente   y las respuestas   bot  y veamos  que podemos mejorarar    armemos un plan

(El archivo es `conversaciones-produccion-2026-11-17.txt`: las 60 conversaciones de producción del 11 al
17/11. El diagnóstico quedó en `backups/consultas-prod-2026-11-17/DIAGNOSTICO.md`, fuera del repositorio.)

## Segundo mensaje (2026-11-17)

(El user pegó la lista de los 8 problemas del diagnóstico y preguntó:)

como lo arreglarias?

## Tercer mensaje (2026-11-18)

la preguntas  que son de Entrega mínima  responderle al cliente  de forma

este arreglo no hagas
6. Deriva y no viene nadie
[…texto de Claude citado: aviso al asesor por Telegram, reaviso a los 30 minutos, "estoy en la agencia", dar el teléfono…]

el bot solo sirve para orientar al cliente  y llegar a una visita el asesor se encarga  de hacer el seguimiento

-----------

que nunca se tome el nombre  de whatsapp , que se le pida el nombre del cliente  una vez  el cliente acordo una avisita
en otro caso  no

cuando el cliente responda  si cuenta  con  vehiculo para entregar que se el bot  le pida images del vehiculo y pero que no frene la conversacion que dentro  de ese mensaje le diga tipo  si me podes  pasar las imgs de vhiculo y segui con  la otra   pregunta  en el mismo mensaje

esto no  lo tomes (
8. Modelos que no hay
[…texto de Claude citado: alerta de stock en `alertas_stock`, aviso al asesor y parecidos por tipo y precio…])

no quiero nada de esto (
[…las 4 preguntas de Claude: presupuesto por WhatsApp, avisos al asesor, teléfono, alerta de stock…])

estas son un par de cosas  que defii despues todo  lo demas  toma   me gusto   quiero saber que falta decidir  y ver

## Cuarto mensaje (2026-11-18)

1. Cómo contesta la entrega mínima. Tu mensaje quedó en "responderle al cliente de forma…". Opciones:  vamos con la  A . 2. Cuotas. Como no va el presupuesto por WhatsApp, propongo dejar "la financiación se arma en la agencia a la medida de tu caso". Lo único que cambia es que no repita la misma pregunta atrás. ¿Te sirve así?   . 3  que en panel nomuestre el nombre si no  lo menciono  o respondio .   Si el cliente lo dice antes de la visita ("soy Claudia"): ¿el bot lo puede usar o espera igual hasta la visita? Recomiendo usarlo sin pedirlo, y no volver a preguntarlo después. si el cliente meciona el nombre antes que se le pida ya no se le vuele a preguntar    (esto Cómo lo pide: recomiendo hacerlo en el mismo mensaje que confirma la visita y pasa la dirección: "¿A nombre de quién le aviso al asesor?" esto no )  . que mas falta decidir o ver

(La opción A de la entrega mínima, citada del mensaje de Claude: "No hay un monto fijo: depende de la
situación de cada cliente, y el asesor te lo calcula en la agencia con tus datos." Después sigue con lo que
falte.)

## Quinto mensaje (2026-11-18)

vamos con esta  A (recomendada): en el mensaje siguiente. Casi todos los clientes contestan "ok, gracias" después de la confirmación, y en vez del 👍 el bot pregunta: "¡Dale! ¿Me decís tu nombre así el asesor sabe quién viene?". Si el cliente no vuelve a escribir, queda sin nombre.
2. Qué muestra el panel cuando no hay nombre. Recomiendo "Sin nombre" vamos con esta

3.  toques ningun dato de produccion que se sigan mostrando  los nombres que se definniron en las consultas que ya llegaron

4. Guardarlas y mostrarlas en el panel, dentro de la consulta, junto al usado. Es trabajo en el backend y en el panel. ¿Lo incluimos?
Pedirlas una sola vez (recomendado): si no las manda, no insiste, y el recordatorio de los 10 minutos no las cuenta.
Cuando llegan (recomendado): un "gracias" y sigue, sin opinar del auto.  vamos con todas todas esto que me definiste en 4. Fotos del usado

## Ajustes

<!-- Si al revisar el plan querés cambiar algo, anotalo acá. -->

**2026-11-18** (respuesta del user en el chat, copiada tal cual):

okey  esta bien plan solo que falta agregar algo  que no esta  que en caso de que  el cliente  no respondio una pregunta   volver  a mandarlo en  10 minutos  una sola vez  pero ahora solo falta definir  en cuales preguntas  se le tiene que recordar

(Claude propuso una tabla: se recuerdan qué auto busca, contado o financiado, anticipo, recibo o garante, si
entrega un vehículo con marca, modelo y año, quién decide y cuándo viene. No se recuerdan el permiso del BCRA,
el CUIL, cuánto pide por el usado, las ofertas como fotos o elegir entre autos, el nombre ni las fotos del
usado. El user respondió:)

si agregalo al plan

**2026-11-18** (respuesta del user en el chat, copiada tal cual):

okey  en el plan quiero que anotes que  nunca se usen  las   apis   de claude code  o otras apis  de produccion   porque  gastan recursos que tengo  limitados ,que todos las test  y simulaciones se hagan en desarrollo sin tocar produccion    simulando que se  usa  el  modelo     haiku  5.5  queu usa  la api de claude code para  las respuetas del cliente   te quedo claro ?

## Aprobación

<!-- Cuando el plan esté bien, agregá: Aprobado: AAAA-MM-DD -->

Aprobado: 2026-11-18 (el user en el chat: "okey  mejor ahora asi arranca  un estimado de cuanto vas a tardar")
