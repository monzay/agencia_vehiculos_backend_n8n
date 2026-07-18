// Traduce una fila `usuarios` al shape publico (SIN el password_hash, nunca sale).
export function mapUsuario(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol, // 'admin' | 'asesor'
    activo: Boolean(u.activo),
    vendedorId: u.vendedor_id ?? null,
    creado: u.created_at ? new Date(u.created_at).toISOString() : null,
    actualizado: u.updated_at ? new Date(u.updated_at).toISOString() : null,
  };
}
