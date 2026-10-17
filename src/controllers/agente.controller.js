import { z } from "zod";
import { firmaValida, mensajeDeMeta } from "../agente/whatsapp.js";

// Lo que manda n8n: el cuerpo del webhook tal cual lo firmó Meta, la firma
// (X-Hub-Signature-256) y, si el mensaje trae foto o audio, el archivo que bajó.
const pedidoSchema = z.object({
  cuerpo: z.string().min(2).max(200_000),
  firma: z.string().max(100),
  media: z.object({ id: z.string().max(200), data: z.string() }).nullish(),
});

const invalido = (res, error) => res.status(400).json({ ok: false, error });

function leerJson(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
}

// Solo campos del mensaje firmado: nada de lo que manda n8n por fuera de la
// firma (salvo el archivo, atado al id del mensaje) llega al orquestador.
function entradaDe(mensaje, media) {
  const archivo = mensaje.media && { media_type: mensaje.media.mediaType, data: media.data };
  return {
    telefono: mensaje.telefono,
    nombre: mensaje.nombre,
    wamid: mensaje.wamid,
    texto: mensaje.texto,
    imagenes: mensaje.media?.tipo === "imagen" ? [archivo] : [],
    audio: mensaje.media?.tipo === "audio" ? archivo : null,
  };
}

export function crearRecibirMensaje({ atender, secretoMeta }) {
  return async (req, res, next) => {
    const pedido = pedidoSchema.safeParse(req.body);
    if (!pedido.success) return invalido(res, "Pedido inválido.");
    const { cuerpo, firma, media } = pedido.data;
    if (!firmaValida(cuerpo, firma, secretoMeta())) return res.status(401).json({ ok: false, error: "Firma de Meta inválida." });

    const payload = leerJson(cuerpo);
    if (payload === undefined) return invalido(res, "El cuerpo no es JSON.");
    const mensaje = mensajeDeMeta(payload);
    if (!mensaje) return res.json({ ok: true, responder: false });
    if (mensaje.media && media?.id !== mensaje.media.id) return invalido(res, "Falta el archivo del mensaje.");

    try {
      const r = await atender(entradaDe(mensaje, media));
      // Reintento ya respondido, o mensaje que se juntó con otros de la misma ráfaga.
      if (r.duplicado || r.juntado || !r.envios?.length) return res.json({ ok: true, responder: false });
      // `envios`: los cuerpos de WhatsApp ya armados (uno por respuesta); n8n solo los manda.
      return res.json({ ok: true, responder: true, para: mensaje.telefono, texto: r.texto, envios: r.envios });
    } catch (err) {
      if (err instanceof z.ZodError) return invalido(res, "Mensaje con un formato que no se puede atender.");
      next(err);
    }
  };
}
