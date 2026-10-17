// Una entrega es una foto de vitrina. El home (público) solo necesita su id y la
// URL de la imagen: nunca datos del cliente.
export function mapEntrega(e) {
  return {
    id: e.id,
    url: e.url,
    creado: e.created_at ? new Date(e.created_at).toISOString() : null,
  };
}

// Para el panel (solo admin): además, el cliente que recibió el auto. Los de
// WhatsApp tienen el número en `canal_id`.
export function mapEntregaGestion(e) {
  const c = e.clientes;
  return {
    ...mapEntrega(e),
    cliente: c ? { id: c.id, nombre: c.nombre || "Sin nombre", telefono: c.telefono || c.canal_id || "" } : null,
  };
}
