// Base simulada de lo que toca el reparto por turnos (vendedores, usuarios y configuración), para las
// pruebas de reparto, de atender y de consultas-por-auto. El bloqueo `SELECT ... FOR UPDATE` se modela de
// verdad: una transacción que lo toma frena a las otras hasta terminar. Sin ese bloqueo, dos consultas
// simultáneas leen el mismo puntero y reciben el mismo turno.

const ULTIMO = "reparto_ultimo_vendedor";
const pausa = () => new Promise((resolver) => setImmediate(resolver));

// Where simple de Prisma: igualdad (null = IS NULL), { not } y { in }.
function cumple(fila, where = {}) {
  return Object.entries(where).every(([campo, esperado]) => {
    if (esperado && typeof esperado === "object") {
      if ("not" in esperado) return (fila[campo] ?? null) !== esperado.not;
      if ("in" in esperado) return esperado.in.includes(fila[campo]);
      throw new Error(`where no soportado en la base falsa: ${campo}`);
    }
    return (fila[campo] ?? null) === esperado;
  });
}

const porId = (a, b) => a.id - b.id;

/**
 * @param {{ vendedores?: object[], usuarios?: object[], configuracion?: Record<string, string|null> }} datos
 * `configuracion` arranca con la fila del puntero (como la deja la migración 082) y el reparto encendido.
 */
export function repartoFalso({ vendedores = [], usuarios = [], configuracion = {} } = {}) {
  const estado = {
    configuracion: { [ULTIMO]: null, reparticion_equitativa: "1", ...configuracion },
    consultasRaw: [],
    transacciones: 0,
    opciones: [],
    // Errores que va a lanzar el bloqueo del puntero, uno por transacción (un deadlock, un timeout).
    fallos: [],
  };
  let cola = Promise.resolve();

  const tablas = {
    vendedores: {
      findFirst: async ({ where }) => (await pausa(), vendedores.find((v) => cumple(v, where)) ?? null),
      findMany: async ({ where } = {}) => (await pausa(), vendedores.filter((v) => cumple(v, where)).sort(porId)),
    },
    usuarios: {
      findMany: async ({ where } = {}) => (await pausa(), usuarios.filter((u) => cumple(u, where))),
    },
    configuracion: {
      findUnique: async ({ where: { clave } }) => (await pausa(), clave in estado.configuracion ? { clave, valor: estado.configuracion[clave] } : null),
      upsert: async ({ where: { clave }, update, create }) => {
        await pausa();
        estado.configuracion = { ...estado.configuracion, [clave]: clave in estado.configuracion ? update.valor : create.valor };
        return { clave };
      },
    },
  };

  // Corre `fn` con un `tx` que es la base `raiz` más un `$queryRaw` con el bloqueo de filas.
  const transaccion = async (raiz, fn, opciones) => {
    estado.transacciones += 1;
    estado.opciones.push(opciones);
    let liberar = () => {};
    const tx = {
      ...raiz,
      $queryRaw: async (textos, ...valores) => {
        estado.consultasRaw.push({ sql: textos.join("?"), valores });
        if (estado.fallos.length) throw estado.fallos.shift();
        if (/FOR UPDATE/i.test(textos.join(" "))) {
          const anterior = cola;
          cola = new Promise((resolver) => (liberar = resolver));
          await anterior;
        }
        const clave = valores[0];
        return clave in estado.configuracion ? [{ valor: estado.configuracion[clave] }] : [];
      },
    };
    try {
      return await fn(tx);
    } finally {
      liberar();
    }
  };

  const db = { estado, ...tablas, $transaction: (fn, opciones) => transaccion(db, fn, opciones) };
  return { ...db, tablas, transaccion };
}
