// Una entrega es una foto de vitrina. El home (público) solo necesita su id y la
// URL de la imagen: nunca datos del cliente.
export function mapEntrega(e) {
  return {
    id: e.id,
    url: e.url,
    creado: e.created_at ? new Date(e.created_at).toISOString() : null,
  };
}

// El cliente que recibió el auto, como lo ve el panel (solo admin).
export function mapClienteDeEntrega(c) {
  return { id: c.id, nombre: c.nombre || "Sin nombre", telefono: c.telefono || "" };
}

// Para el panel (solo admin): además, el cliente que recibió el auto.
export function mapEntregaGestion(e) {
  return {
    ...mapEntrega(e),
    cliente: e.clientes ? mapClienteDeEntrega(e.clientes) : null,
  };
}
