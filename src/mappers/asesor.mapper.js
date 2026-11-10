// Traduce una fila `vendedores` de la DB al shape "asesor" que consume el front.
//
// En la DB la tabla se llama `vendedores` (la referencian `turnos` y el bot via
// `chat_estado.vendedor_id`). De cara al panel y a la API lo llamamos "asesor".
//
// El front espera:
//   { id, nombre, telefono, telegramId, email, activo, leadsActivos,
//     tieneCuenta, cuentaActiva, creado, actualizado }
//
// `cuenta` es la fila `usuarios` (rol='asesor') vinculada al asesor, si tiene
// acceso al panel. La contraseña NUNCA se expone.

export function mapVendedorToAsesor(v, cuenta = null) {
  return {
    id: v.id,
    nombre: v.nombre,
    // Identificador público de su link de captación (`/a/<slug>`).
    slug: v.slug ?? "",
    telefono: v.telefono ?? "",
    telegramId: v.telegram_id ?? "",
    // Si tiene cuenta, el email de login manda (es el que usa para entrar).
    email: cuenta?.email ?? v.email ?? "",
    activo: Boolean(v.activo),
    // Si participa del reparto por turnos (el admin lo controla por asesor).
    recibeConsultas: v.recibe_consultas == null ? true : Boolean(v.recibe_consultas),
    leadsActivos: v.leads_activos ?? 0,
    tieneCuenta: Boolean(cuenta),
    cuentaActiva: cuenta ? Boolean(cuenta.activo) : false,
    // El asesor es en realidad la cuenta del administrador (no se puede eliminar).
    esAdmin: cuenta?.rol === "admin",
    creado: v.created_at ? new Date(v.created_at).toISOString() : null,
    actualizado: v.updated_at ? new Date(v.updated_at).toISOString() : null,
  };
}
