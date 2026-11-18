// Doble de Claude para la simulación: responde un guion, sin red ni claves.
const RESPALDO = "Dale, te paso con un asesor.";
const USAGE = () => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });

export function crearClaudeFalso(guion = []) {
  const pendientes = [...guion];
  const llamadas = [];
  let ids = 0;
  const respuesta = (paso) => {
    if (paso?.herramienta) {
      ids += 1;
      return {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: `toolu_falso_${ids}`, name: paso.herramienta, input: paso.entrada ?? {} }],
        usage: USAGE(),
      };
    }
    return { stop_reason: "end_turn", content: [{ type: "text", text: paso?.texto ?? RESPALDO }], usage: USAGE() };
  };
  return {
    llamadas,
    messages: {
      async create(params) {
        llamadas.push(params);
        return respuesta(pendientes.shift());
      },
    },
  };
}

// Doble de Claude por turnos: el guion se abre por cada mensaje del cliente y no se desfasa.
// Si el código llama de más (o no hay turno abierto) la llamada falla nombrando el paso; como
// atender se traga los errores del modelo y responde un respaldo, además queda marcado para que
// cerrarTurno() lo delate. Si sobran respuestas del guion, cerrarTurno() también falla.
export function crearClaudeFalsoPorTurnos() {
  const llamadas = [];
  let ids = 0;
  let turno = null; // { etiqueta, pendientes, errores }

  const respuesta = (paso) => {
    if (paso.herramienta) {
      ids += 1;
      return { stop_reason: "tool_use", content: [{ type: "tool_use", id: `toolu_falso_${ids}`, name: paso.herramienta, input: paso.entrada ?? {} }], usage: USAGE() };
    }
    return { stop_reason: "end_turn", content: [{ type: "text", text: paso.texto ?? "" }], usage: USAGE() };
  };

  return {
    llamadas,
    messages: {
      async create(params) {
        llamadas.push(params);
        if (!turno) throw new Error("el modelo simulado recibió una llamada sin un turno abierto");
        if (turno.pendientes.length === 0) {
          const mensaje = `el modelo simulado no tiene más respuestas en ${turno.etiqueta}: el código lo llamó de más`;
          turno.errores.push(mensaje);
          throw new Error(mensaje);
        }
        return respuesta(turno.pendientes.shift());
      },
    },
    abrirTurno(guion, etiqueta) {
      turno = { etiqueta, pendientes: [...(guion ?? [])], errores: [] };
    },
    cerrarTurno() {
      const actual = turno;
      turno = null;
      if (!actual) return;
      if (actual.errores.length) throw new Error(actual.errores[0]);
      if (actual.pendientes.length) {
        throw new Error(`el modelo simulado dejó ${actual.pendientes.length} respuesta(s) sin usar en ${actual.etiqueta}: el código llamó de menos`);
      }
    },
  };
}
