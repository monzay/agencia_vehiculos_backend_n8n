// Envío saliente a la WhatsApp Cloud API, para responder desde el panel (intervención
// humana). El bot entrante lo arma n8n; esto, en cambio, sale directo del backend con
// `WA_TOKEN` y `WA_PHONE_NUMBER_ID`. Reusa el armado de cuerpos de `enviosDeRespuesta`.
//
// A diferencia del cliente del BCRA, acá SÍ lanzamos: el que llama (responderComoHumano)
// necesita saber si Meta aceptó para no dejar un saliente fantasma en el historial.

import { enviosDeRespuesta } from "./envios.js";

const VERSION_GRAPH = "v21.0";
const TIEMPO_MAXIMO_MS = 15_000;

export function crearEnvioWhatsapp({
  fetch = globalThis.fetch,
  token = process.env.WA_TOKEN,
  phoneNumberId = process.env.WA_PHONE_NUMBER_ID,
  version = VERSION_GRAPH,
  tiempoMaximoMs = TIEMPO_MAXIMO_MS,
} = {}) {
  return {
    // Manda un texto al cliente. Devuelve el wamid que asigna Meta (para guardarlo).
    async enviarTexto({ telefono, texto }) {
      if (!token || !phoneNumberId) {
        throw new Error("Falta WA_TOKEN o WA_PHONE_NUMBER_ID para enviar por WhatsApp.");
      }
      const [envio] = enviosDeRespuesta({ texto });
      if (!envio) throw new Error("No hay texto para enviar.");

      const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: telefono, ...envio }),
        signal: AbortSignal.timeout(tiempoMaximoMs),
      });
      if (!res.ok) {
        const detalle = await res.text().catch(() => "");
        throw Object.assign(new Error(`WhatsApp respondió ${res.status}`), { status: res.status, detalle });
      }
      const cuerpo = await res.json().catch(() => ({}));
      return { wamid: cuerpo?.messages?.[0]?.id ?? null };
    },
  };
}
