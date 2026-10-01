// Cómo se validan los campos de los contratos del legajo (consignación, compra,
// permuta). Todos imprimen montos, opciones y textos libres, y tienen que
// rechazarlos igual.

export function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

// Todos los montos de los contratos viven en columnas DECIMAL(12,2): más que
// esto no entra en la base. Sin el tope, un cero de más no es un error de carga
// sino un 500 (MySQL rechaza el INSERT y Prisma tira P2020).
export const TOPE_MONTO = 9999999999.99;

const conSeparadores = (n) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

export function numero(valor, campo, { min = 0, max = null } = {}) {
  const n = Number(valor);
  if (valor === "" || valor === null || valor === undefined || !Number.isFinite(n)) {
    throw error(`${campo} debe ser un número.`);
  }
  if (n < min) throw error(`${campo} no puede ser menor a ${conSeparadores(min)}.`);
  if (max != null && n > max) {
    throw error(`${campo} no puede ser mayor a ${conSeparadores(max)}: ese es el máximo que admite el sistema.`);
  }
  return n;
}

export function opcion(valor, campo, validas, porDefecto) {
  if (valor === undefined) return porDefecto;
  if (!validas.includes(valor)) throw error(`${campo} debe ser uno de: ${validas.join(", ")}.`);
  return valor;
}

export const booleano = (valor, porDefecto) => (valor === undefined ? porDefecto : valor === true || valor === "true");

// Los textos libres del contrato: los escribe la agencia y van tal cual al
// impreso. El tope no es redondo por gusto: el contrato de consignación ocupa
// una carilla A4 y se midió cuánto texto entra en el peor caso (los nueve
// papeles del catálogo en la cláusula 11, nombre y domicilio largos). Con 550
// caracteres en cada uno de los dos textos libres todavía entra; arriba de eso
// pasa a una segunda hoja. 500 deja margen.
export function textoLibre(valor, campo, max = 500) {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  if (limpio.length > max) throw error(`${campo} no puede superar los ${max} caracteres.`);
  return limpio || null;
}

// Fecha sin hora (AAAA-MM-DD), para columnas DATE.
export function fechaSimple(valor, campo) {
  const iso = String(valor ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(iso))) throw error(`${campo} no es una fecha válida.`);
  return new Date(`${iso}T00:00:00Z`);
}

// Fecha con hora (un instante), para columnas DATETIME.
export function momento(valor, campo) {
  const d = new Date(valor ?? "");
  if (valor === "" || valor == null || Number.isNaN(d.getTime())) throw error(`${campo} no es una fecha y hora válida.`);
  return d;
}
