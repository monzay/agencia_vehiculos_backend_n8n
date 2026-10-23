import Anthropic from "@anthropic-ai/sdk";

// El cliente de Anthropic que usan el bot y la lectura de documentos. Una clave
// común ya pertenece a un workspace; una clave de usuario (sk-ant-usr-…) no, y la
// API exige el header `anthropic-workspace-id`: sale de ANTHROPIC_WORKSPACE_ID.

const ID_WORKSPACE = /^wrkspc_[A-Za-z0-9]+$/;

/** Las opciones del cliente según el entorno. Un ID mal pegado corta al arrancar. */
export function opcionesAnthropic(env = process.env) {
  const workspace = String(env.ANTHROPIC_WORKSPACE_ID ?? "").trim();
  if (!workspace) return {};
  if (!ID_WORKSPACE.test(workspace)) {
    throw new Error("ANTHROPIC_WORKSPACE_ID no tiene la forma de un ID de workspace (wrkspc_…).");
  }
  return { defaultHeaders: { "anthropic-workspace-id": workspace } };
}

export const crearClienteAnthropic = () => new Anthropic(opcionesAnthropic());
