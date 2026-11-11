// Mensaje predefinido de la web: el botón "Consultar" de un auto abre WhatsApp con
// "... (REF #<ref>)" y, si el cliente llegó por el link de un asesor, " [AS:<slug>]"
// (ver web/sea_automotores/lib/constantes.js). Es lo único que wa.me deja pasar.

const REF = /\(REF #([A-Za-z0-9-]{1,20})\)/i;
const ASESOR = /\s*\[AS:([a-z0-9-]{1,40})\]/i;

export function datosDeLaWeb(texto) {
  const t = String(texto ?? "");
  return {
    ref: t.match(REF)?.[1] ?? null,
    asesor: t.match(ASESOR)?.[1]?.toLowerCase() ?? null,
    texto: t.replace(ASESOR, "").trim(),
  };
}

// El código de un auto como lo escribe la IA ("#13", "REF #13", "(REF #13)") sin el
// adorno; null si el texto no es un código.
const CODIGO_ESCRITO = /^\(?\s*(?:ref)?[\s.:#-]*([A-Za-z0-9][A-Za-z0-9-]{0,19})\s*\)?$/i;

export function codigoDeAuto(texto) {
  return String(texto ?? "").trim().match(CODIGO_ESCRITO)?.[1] ?? null;
}

// Solo una URL https configurada: el link lo abre el cliente en su celular.
export function linkDelCatalogo(urlPublica, ref = null) {
  const base = String(urlPublica ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+/.test(base)) return null;
  return ref ? `${base}/catalogo/${encodeURIComponent(ref)}` : `${base}/catalogo`;
}
