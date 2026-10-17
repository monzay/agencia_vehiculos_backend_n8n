import { createHmac, timingSafeEqual } from "node:crypto";

// Lo que llega de Meta: verificación de la firma y lectura del mensaje.

const FORMATO_FIRMA = /^sha256=[0-9a-f]{64}$/;

// Meta firma el cuerpo crudo con el secreto de la app (X-Hub-Signature-256).
// Comparación en tiempo constante; sin secreto configurado no pasa nada.
export function firmaValida(cuerpo, firma, secreto) {
  if (!secreto || !FORMATO_FIRMA.test(firma ?? "")) return false;
  const esperada = Buffer.from(`sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`);
  return timingSafeEqual(esperada, Buffer.from(firma));
}

const TIPO_MEDIA = { image: "imagen", audio: "audio" };

const sinParametros = (mime) => String(mime ?? "").split(";")[0].trim();

function textoDe(mensaje) {
  switch (mensaje.type) {
    case "text":
      return mensaje.text?.body ?? null;
    case "image":
      return mensaje.image?.caption ?? null;
    case "audio":
      return null;
    case "button":
      return mensaje.button?.text ?? null;
    case "interactive":
      return mensaje.interactive?.button_reply?.title ?? mensaje.interactive?.list_reply?.title ?? null;
    default:
      return `[${mensaje.type}]`;
  }
}

function mediaDe(mensaje) {
  const tipo = TIPO_MEDIA[mensaje.type];
  const datos = mensaje[mensaje.type];
  if (!tipo || !datos?.id) return null;
  return { id: datos.id, tipo, mediaType: sinParametros(datos.mime_type) };
}

// Primer mensaje del payload, o null si es un aviso de estado u otra cosa.
export function mensajeDeMeta(payload) {
  const valor = payload?.entry?.[0]?.changes?.[0]?.value;
  const mensaje = valor?.messages?.[0];
  if (payload?.object !== "whatsapp_business_account" || !mensaje?.from || !mensaje?.id) return null;
  const contacto = valor.contacts?.find((c) => c.wa_id === mensaje.from) ?? valor.contacts?.[0];
  return {
    telefono: mensaje.from,
    nombre: contacto?.profile?.name ?? null,
    wamid: mensaje.id,
    texto: textoDe(mensaje),
    media: mediaDe(mensaje),
  };
}
