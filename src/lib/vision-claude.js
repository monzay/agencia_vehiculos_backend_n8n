// Lo único que habla con el modelo de visión. Recibe imágenes + un esquema y
// devuelve el JSON que respeta ese esquema.
//
// Está aislado a propósito: cambiar de proveedor toca este archivo y ninguno más.
// Usa Claude (SDK oficial de Anthropic). La clave NUNCA sale del backend: el
// panel no la ve ni la necesita.

import Anthropic from "@anthropic-ai/sdk";
import { crearClienteAnthropic } from "./anthropic.js";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// Haiku por defecto: la tarea es transcribir un papel impreso, no razonar.
// Medido sobre los papeles de la demo, lee igual que Opus y sale cinco veces y
// media más barato. Se cambia por entorno si algún papel difícil lo pide.
const MODELO = process.env.ANTHROPIC_VISION_MODEL || "claude-haiku-4-5";
const MAX_TOKENS = 16000;

function error(mensaje, status) {
  const e = new Error(mensaje);
  e.status = status;
  // `publico` le dice al manejador de errores que este mensaje es para mostrar:
  // son fallos previstos de un servicio externo, no un bug que haya que ocultar.
  e.publico = true;
  return e;
}

export const hayProveedor = () => Boolean(process.env.ANTHROPIC_API_KEY);

// Se crea una sola vez, no por pedido: el cliente maneja reintentos y timeouts.
let cliente = null;
const clienteAnthropic = () => (cliente ??= crearClienteAnthropic());

// `imagenes` son URLs de Blob ya firmadas por quien llama: el modelo las
// descarga por su cuenta, así que no hay que bajarlas ni convertirlas acá.
// `esquema` es el esquema Zod que la respuesta tiene que cumplir.
export async function leerDocumento({ imagenes, instruccion, esquema }) {
  if (!hayProveedor()) {
    throw error("La lectura automática no está configurada: falta la clave del proveedor de IA.", 503);
  }

  let respuesta;
  try {
    respuesta = await clienteAnthropic().messages.parse({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: [
            ...imagenes.map((url) => ({ type: "image", source: { type: "url", url } })),
            { type: "text", text: instruccion },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(esquema) },
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      console.error(`[vision] credencial rechazada: ${e.message}`);
      throw error("El servicio de lectura rechazó la credencial. Avisale a quien administra el sistema.", 502);
    }
    // Sin saldo la API responde 400, igual que un pedido mal armado. Distinguirlo
    // importa: no es un problema del papel ni del código, es la cuenta.
    if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message)) {
      throw error("La cuenta del servicio de lectura no tiene saldo. Cargá crédito para poder escanear.", 402);
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw error("El servicio de lectura está saturado. Probá de nuevo en un rato.", 503);
    }
    if (e instanceof Anthropic.APIError) {
      // El detalle puede traer datos de la cuenta: queda en el log del servidor.
      console.error(`[vision] ${e.status} ${e.message}`);
      throw error("El servicio de lectura no pudo leer el documento. Cargá los datos a mano.", 502);
    }
    throw error("El servicio de lectura no respondió. Probá de nuevo o cargá los datos a mano.", 504);
  }

  // El modelo puede negarse a responder por sus propias reglas de seguridad.
  if (respuesta.stop_reason === "refusal") {
    console.error(`[vision] rechazo: ${respuesta.stop_details?.category ?? "sin categoría"}`);
    throw error("El servicio de lectura no quiso procesar esta imagen. Cargá los datos a mano.", 502);
  }

  // `parsed_output` viene en null si la respuesta no cumplió el esquema.
  if (!respuesta.parsed_output) {
    throw error("El servicio de lectura devolvió una respuesta ilegible.", 502);
  }
  return respuesta.parsed_output;
}
