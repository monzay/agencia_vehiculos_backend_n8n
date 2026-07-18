// Una consignación es un vehículo del catálogo que la agencia vende por cuenta
// de su dueño. `Decimal` de Prisma se convierte a número para que el front no
// reciba objetos.

// Lo que la agencia se lleva si se vende al precio pactado.
const comisionEnPesos = (precio, comision) => Math.round(precio * (comision / 100) * 100) / 100;

// Datos del auto que necesita el panel. Se toma de la relación `autos`, no se
// copia en la tabla: si se corrige el auto, la consignación lo refleja sola.
const mapAuto = (a) =>
  a
    ? {
        ref: a.ref,
        marca: a.marca,
        modelo: a.modelo,
        anio: a.anio,
        kms: a.kms ?? null,
        precio: a.precio != null ? Number(a.precio) : null,
        imagen: Array.isArray(a.fotos_json) && a.fotos_json[0] ? String(a.fotos_json[0]).replace(/^\.\//, "/") : null,
      }
    : null;

export function mapConsignacion(c) {
  const precio = Number(c.precio_pactado);
  const comision = Number(c.comision);

  return {
    id: c.id,
    vehiculo: mapAuto(c.autos),
    patente: c.patente ?? null,
    duenio: {
      nombre: c.duenio_nombre,
      telefono: c.duenio_telefono ?? null,
    },
    precioPactado: precio,
    comision, // porcentaje
    comisionPesos: comisionEnPesos(precio, comision),
    estado: c.estado, // en_venta | vendido | retirado
    notas: c.notas ?? null,
    creado: c.created_at ? new Date(c.created_at).toISOString() : null,
    actualizado: c.updated_at ? new Date(c.updated_at).toISOString() : null,
  };
}
