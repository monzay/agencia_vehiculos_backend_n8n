// Lo que sale por WhatsApp en cada respuesta, armado acá para que n8n solo lo
// mande (cuerpos de la Cloud API, sin `to`). Meta cobra cada mensaje entregado,
// no lo que lleva adentro: una respuesta es UN mensaje y, si van fotos, la
// primera va arriba del texto con un botón a la ficha web. Las reacciones son
// gratis (y no gastan los 1.000 mensajes gratis del mes).

export const REACCION_CIERRE = "👍";

const MAX_CUERPO_INTERACTIVO = 1024; // límite de Meta para el texto de un mensaje con botón
const TEXTO_BOTON_FOTOS = "Ver todas las fotos"; // Meta acepta hasta 20 caracteres
const TEXTO_SOLO_FOTOS = "Te paso las fotos 👇";

export const envioDeTexto = (texto) => ({ type: "text", text: { body: texto } });

export const envioDeReaccion = (wamid, emoji = REACCION_CIERRE) => ({ type: "reaction", reaction: { message_id: wamid, emoji } });

// Meta solo acepta imágenes JPG o PNG por https: si rechaza la foto, se pierde el
// mensaje entero (texto incluido), así que una que no cumple no se usa.
const FOTO_ACEPTADA = /^https:\/\/\S+\.(?:jpe?g|png)(?:\?\S*)?$/i;

// El botón a la ficha web, con la foto arriba si hay una que sirva.
const envioConBoton = (texto, ficha, foto) => ({
  type: "interactive",
  interactive: {
    type: "cta_url",
    ...(foto && { header: { type: "image", image: { link: foto } } }),
    body: { text: texto },
    action: { name: "cta_url", parameters: { display_text: TEXTO_BOTON_FOTOS, url: ficha } },
  },
});

const envioDeFoto = (foto, caption) => ({ type: "image", image: caption ? { link: foto, caption } : { link: foto } });

function enviosConFotos(texto, fotos, ficha) {
  const foto = fotos.find((f) => FOTO_ACEPTADA.test(f)) ?? null;
  const cuerpo = texto || TEXTO_SOLO_FOTOS;
  if (!foto && !ficha) return texto ? [envioDeTexto(texto)] : [];
  if (cuerpo.length > MAX_CUERPO_INTERACTIVO) {
    return [envioDeTexto(cuerpo), ficha ? envioConBoton(TEXTO_SOLO_FOTOS, ficha, foto) : envioDeFoto(foto)];
  }
  return [ficha ? envioConBoton(cuerpo, ficha, foto) : envioDeFoto(foto, cuerpo)];
}

export function enviosDeRespuesta({ texto, fotos = [], ficha = null, reaccion = null, wamid = null } = {}) {
  if (reaccion) return wamid ? [envioDeReaccion(wamid, reaccion)] : [];
  const limpio = String(texto ?? "").trim();
  if (fotos.length) return enviosConFotos(limpio, fotos, ficha);
  return limpio ? [envioDeTexto(limpio)] : [];
}
