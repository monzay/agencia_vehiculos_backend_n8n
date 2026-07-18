// Una entrega es una foto de vitrina: solo su id y la URL de la imagen. El home
// no necesita más que eso para armar la galería.
export function mapEntrega(e) {
  return {
    id: e.id,
    url: e.url,
    creado: e.created_at ? new Date(e.created_at).toISOString() : null,
  };
}
