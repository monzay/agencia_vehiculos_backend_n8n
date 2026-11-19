// Traduce una fila `autos` de la DB al shape que consume el front.
//
// La DB guarda:
//   - tipo (enum): "0km" | "usado"  -> en el front esto es `condicion`
//   - descripcion: "Auto · gnc" / "Moto" / "Auto · nafta" -> codifica
//     el tipo de vehiculo (auto/camioneta/camion/moto) y el combustible
//   - fotos_json: ["./vehiculos/archivo.jpg", ...]
//
// El front espera:
//   { id, ref, brand, model, year, kms, tipo, condicion, combustible,
//     precio, color, image, descripcion, disponible }

import { aplicarDescuento } from "./descuento.mapper.js";
import { mapPromosDeAuto } from "./promocion.mapper.js";
import { normalizarTipoVehiculo } from "../lib/tipos-vehiculo.js";
import { COMBUSTIBLES } from "../lib/combustibles.js";

function parseDescripcion(descripcion) {
  // "Auto · gnc" -> { tipoVehiculo: "auto", combustible: "gnc" }
  const partes = String(descripcion ?? "")
    .split("·")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const primera = partes[0] ?? "";
  const tipoVehiculo = normalizarTipoVehiculo(primera.split(/\s+/)[0]);

  const combustible = partes
    .slice(1)
    .find((p) => COMBUSTIBLES.includes(p)) ?? "";

  return { tipoVehiculo, combustible };
}

function normalizarFoto(f) {
  // "./vehiculos/x.jpg" -> "/vehiculos/x.jpg" (ruta absoluta del front)
  return String(f).replace(/^\.\//, "/");
}

function primeraFoto(fotosJson) {
  if (Array.isArray(fotosJson) && fotosJson.length > 0) {
    return normalizarFoto(fotosJson[0]);
  }
  return "/placeholder.svg";
}

function todasLasFotos(fotosJson) {
  return Array.isArray(fotosJson) ? fotosJson.map(normalizarFoto) : [];
}

// Consignación vigente del auto, si la consulta la incluyó. El panel la usa
// para saber que el auto es de un tercero y ofrecer "vendido / retirado".
function mapConsignacionDeAuto(consignaciones) {
  const c = Array.isArray(consignaciones) ? consignaciones[0] : null;
  if (!c) return null;
  return {
    id: c.id,
    estado: c.estado,
    duenio_nombre: c.duenio_nombre,
    precio_pactado: Number(c.precio_pactado),
    comision: Number(c.comision),
  };
}

export function mapAutoToVehiculo(auto) {
  // Fuente normalizada (1NF): columnas atómicas `tipo_vehiculo` / `combustible`.
  // Fallback al parser de `descripcion` para filas viejas sin backfill.
  const parseado = parseDescripcion(auto.descripcion);
  const tipoVehiculo = auto.tipo_vehiculo ?? parseado.tipoVehiculo;
  const combustible = auto.combustible ?? parseado.combustible;

  // Si la consulta incluyo la relacion `descuentos`, calculamos el precio final.
  // (auto.descuentos viene de `include: { descuentos: true }` en el service).
  const precioBase = auto.precio != null ? Number(auto.precio) : 0;
  const { descuento, precio_final, ahorro } = aplicarDescuento(
    precioBase,
    auto.descuentos
  );

  return {
    id: Number(auto.ref) || auto.ref, // el front usa la `ref` como identificador
    ref: auto.ref,
    brand: auto.marca,
    model: auto.modelo,
    version: auto.version ?? null,
    year: auto.anio,
    kms: auto.kms ?? 0,
    stock: auto.stock ?? 0, // unidades disponibles
    // En la DB `tipo` es la condicion (0km/usado). El enum de Prisma mapea "0km" -> "km".
    condicion: auto.tipo === "km" ? "0km" : "usado",
    tipo: tipoVehiculo, // "auto" | "camioneta" | "camion" | "moto"
    combustible,
    precio: precioBase,
    descuento, // null o { id, nombre, tipo, valor, ... }
    precio_final, // precio ya con el descuento aplicado
    ahorro, // cuanto se ahorra respecto del precio base
    precio_contado: auto.precio_contado != null ? Number(auto.precio_contado) : null,
    anticipo: auto.anticipo != null ? Number(auto.anticipo) : null,
    promociones: mapPromosDeAuto(auto.auto_promociones), // promos VIGENTES del vehiculo
    color: "",
    image: primeraFoto(auto.fotos_json),
    imagenes: todasLasFotos(auto.fotos_json), // array completo (para editar en el panel)
    descripcion: auto.descripcion ?? "",
    disponible: Boolean(auto.disponible),

    // Datos de gestión: solo llegan con valor en el listado del panel. El costo
    // de compra no va, porque este objeto también sale en la API pública.
    precio_venta: auto.precio_venta != null ? Number(auto.precio_venta) : null,
    vendido_at: auto.vendido_at ?? null,
    vendido: auto.vendido_at != null,
    consignacion: mapConsignacionDeAuto(auto.consignaciones),
  };
}
