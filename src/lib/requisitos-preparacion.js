// Qué necesita un usado para salir a la web, y en qué etapa está.
//
// Un papel cuenta solo si la agencia lo tiene (copia u original), no venció y es de
// este auto. El informe de dominio además tiene que estar limpio.

const TENENCIAS_VALIDAS = ["copia", "original"];
const GRAVAMENES = ["prenda", "embargo", "inhibicion", "denuncia_robo"];

const papelValido = (d) => Boolean(d) && TENENCIAS_VALIDAS.includes(d.tenencia) && !d.vencido && !d.diferencias?.length;
const informeLimpio = (d) => papelValido(d) && !GRAVAMENES.some((campo) => d.datos?.[campo] === true);

/**
 * @param {{ documentos: object[], fotos: string[], precioVenta: number|null }} entrada documentos ya mapeados
 * @returns {{ habilitado: boolean, items: { clave: string, label: string, donde: string, cumplido: boolean }[] }}
 */
export function requisitosPreparacion({ documentos, fotos, precioVenta }) {
  const papel = (tipo) => documentos.find((d) => d.tipo === tipo);
  const EN_PAPELES = "Se carga en Papeles, en el legajo del trámite";
  const items = [
    { clave: "titulo", label: "Título del automotor", donde: EN_PAPELES, cumplido: papelValido(papel("titulo")) },
    { clave: "formulario_08", label: "Formulario 08", donde: EN_PAPELES, cumplido: papelValido(papel("formulario_08")) },
    {
      clave: "informe_dominio",
      label: "Informe de dominio sin prenda, embargo, inhibición ni denuncia de robo",
      donde: EN_PAPELES,
      cumplido: informeLimpio(papel("informe_dominio")),
    },
    { clave: "foto", label: "Al menos una foto", donde: "Se carga acá abajo", cumplido: Array.isArray(fotos) && fotos.length > 0 },
    { clave: "precio", label: "Precio de venta", donde: "Se carga acá abajo", cumplido: Number(precioVenta) > 0 },
  ];
  return { habilitado: items.every((i) => i.cumplido), items };
}

/**
 * Publicado y Vendido no se guardan: salen de la ficha del catálogo, así nunca dicen
 * algo distinto que la web. Una ficha borrada no cuenta.
 * @returns {"recibido"|"en_preparacion"|"listo"|"publicado"|"vendido"}
 */
export function etapaDe({ estado, auto }) {
  if (!auto || auto.deleted_at) return estado;
  if (auto.vendido_at) return "vendido";
  return auto.disponible ? "publicado" : estado;
}
