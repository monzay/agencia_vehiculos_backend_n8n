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
