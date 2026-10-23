// Cómo buscar un teléfono que el usuario escribió o pegó en un buscador.
//
// `clientes.telefono` se guarda siempre con 10 dígitos (3884708347), pero se pega
// como venga: +54 9 388 470-8347, 0388 15 470-8347, 388 470-8347. Lo usan los
// buscadores de Clientes, Consultas y Entregas, para que el mismo número se
// encuentre escrito como se escriba.

import { telefonoNacional } from "./provincias.js";

// Con menos dígitos que esto es un número parcial (el final, la característica):
// se busca tal cual. Normalizarlo no tiene sentido y un 500 suelto, dentro de
// "Fiat 500", traería a todos los que lo tienen en el teléfono.
const DIGITOS_NUMERO_ENTERO = 6;

// Con qué cadenas buscar dentro del teléfono guardado lo que el usuario escribió.
// Siempre lo escrito; si es un número entero, además sus dígitos y el nacional de
// 10 dígitos con que se guarda (cuando se puede reconocer). Sin repetidos y sin
// cadenas vacías, que traerían a todos.
export function telefonosParaBuscar(texto) {
  const escrito = String(texto ?? "").trim();
  const digitos = escrito.replace(/\D/g, "");
  const formas = digitos.length >= DIGITOS_NUMERO_ENTERO ? [escrito, digitos, telefonoNacional(escrito)] : [escrito];
  return [...new Set(formas.filter(Boolean))];
}
