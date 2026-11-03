import { marcarHito, desmarcarHito } from "../services/tramite-hitos.service.js";
import {
  listarIngresos,
  obtenerIngreso,
  crearIngreso,
  actualizarIngreso,
  eliminarIngreso,
} from "../services/ingresos.service.js";
import { cambiarEstadoIngreso, venderIngreso, deshacerVentaIngreso } from "../services/ingreso-publicacion.service.js";
import {
  listarDocumentos,
  guardarDocumento,
  eliminarDocumento,
  firmarImagenesDocumento,
} from "../services/ingreso-documentos.service.js";
import {
  obtenerContrato,
  guardarContrato,
  firmarContrato,
  desfirmarContrato,
  armarImpresos,
} from "../services/ingreso-contratos.service.js";
import {
  obtenerCompraventa,
  guardarCompraventa,
  firmarCompraventa,
  desfirmarCompraventa,
  armarImpresosCompraventa,
  venderAutoDelBoleto,
  deshacerVentaDelBoleto,
} from "../services/ingreso-compraventa.service.js";
import { extraerDatos } from "../services/extraccion.service.js";
import { crearFinanciacionDeIngreso } from "../services/financiaciones.service.js";
import { buscarPersonas } from "../services/personas.service.js";
import { precargaDeConsulta } from "../services/precarga-tramite.service.js";
import { CATALOGO } from "../lib/documentos-catalogo.js";

const NO_ENCONTRADO = { ok: false, error: "Ingreso no encontrado" };

export async function getPrecarga(req, res, next) {
  try {
    const precarga = await precargaDeConsulta(req.params.sesionId);
    if (!precarga) return res.status(404).json({ ok: false, error: "Consulta no encontrada" });
    res.json({ ok: true, data: precarga });
  } catch (err) {
    next(err);
  }
}

// El catálogo de papeles se sirve tal cual: el panel dibuja los formularios y
// la lista de "qué se completa a mano" leyendo esto, así no hay dos copias de
// la misma definición.
export function getCatalogoDocumentos(req, res) {
  res.json({ ok: true, data: CATALOGO });
}

export async function getPersonas(req, res, next) {
  try {
    res.json({ ok: true, data: await buscarPersonas(req.query.q, req.query.limite) });
  } catch (err) {
    next(err);
  }
}

export async function getIngresos(req, res, next) {
  try {
    const { items, hayMas, total } = await listarIngresos({
      modalidad: req.query.modalidad,
      estado: req.query.estado,
      q: req.query.q,
      offset: req.query.offset,
      limite: req.query.limite,
    });
    res.json({ ok: true, total, data: { items, hayMas, total } });
  } catch (err) {
    next(err);
  }
}

// Las financiaciones son solo del admin (igual que /api/financiaciones): el
// asesor ve el legajo, pero no el plan de cuotas del cliente.
const sinFinanciacionSiNoEsAdmin = (ingreso, usuario) =>
  usuario?.rol === "admin" ? ingreso : { ...ingreso, financiacion: null };

export async function getIngreso(req, res, next) {
  try {
    const ingreso = await obtenerIngreso(req.params.id);
    if (!ingreso) return res.status(404).json(NO_ENCONTRADO);
    res.json({ ok: true, data: sinFinanciacionSiNoEsAdmin(ingreso, req.usuario) });
  } catch (err) {
    next(err);
  }
}

export async function postFinanciacionIngreso(req, res, next) {
  try {
    res.status(201).json({ ok: true, data: await crearFinanciacionDeIngreso(req.params.id, req.body) });
  } catch (err) {
    next(err);
  }
}

export async function postIngreso(req, res, next) {
  try {
    res.status(201).json({ ok: true, data: await crearIngreso(req.body, req.usuario.id) });
  } catch (err) {
    next(err);
  }
}

export async function patchIngreso(req, res, next) {
  try {
    const ingreso = await actualizarIngreso(req.params.id, req.body);
    if (!ingreso) return res.status(404).json(NO_ENCONTRADO);
    res.json({ ok: true, data: ingreso });
  } catch (err) {
    next(err);
  }
}

export async function deleteIngreso(req, res, next) {
  try {
    const ok = await eliminarIngreso(req.params.id);
    if (!ok) return res.status(404).json(NO_ENCONTRADO);
    res.json({ ok: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
}

// ── Papeles ──

export async function getDocumentos(req, res, next) {
  try {
    res.json({ ok: true, data: await listarDocumentos(req.params.id) });
  } catch (err) {
    next(err);
  }
}

export async function putDocumento(req, res, next) {
  try {
    res.json({ ok: true, data: await guardarDocumento(req.params.id, req.body, req.usuario.id) });
  } catch (err) {
    next(err);
  }
}

export async function deleteDocumento(req, res, next) {
  try {
    const ok = await eliminarDocumento(req.params.id, req.params.documentoId);
    if (!ok) return res.status(404).json({ ok: false, error: "Documento no encontrado" });
    res.json({ ok: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
}

// Devuelve URLs firmadas para ver las imágenes de un papel. Vencen en minutos:
// el panel las pide cuando abre el papel, no las guarda.
export async function postFirmaImagenes(req, res, next) {
  try {
    const urls = await firmarImagenesDocumento(req.params.id, req.body?.imagenes);
    res.json({ ok: true, data: { urls } });
  } catch (err) {
    next(err);
  }
}

// Lee las fotos de un papel y propone sus datos. No guarda: la respuesta va al
// formulario para que una persona la revise antes de confirmar.
export async function postExtraccion(req, res, next) {
  try {
    res.json({ ok: true, data: await extraerDatos(req.params.id, req.body) });
  } catch (err) {
    next(err);
  }
}

// Publicar, despublicar o retirar. Cambia el estado del ingreso y, con él, si el
// auto se ve o no en la web: las dos cosas van juntas o no van.
export async function postEstado(req, res, next) {
  try {
    res.json({ ok: true, data: await cambiarEstadoIngreso(req.params.id, req.body?.estado) });
  } catch (err) {
    next(err);
  }
}

// Cobrado, Entregado y Transferido de una venta.
export async function putHito(req, res, next) {
  try {
    res.json({ ok: true, data: await marcarHito(req.params.id, req.params.tipo, req.body ?? {}, req.usuario.id) });
  } catch (err) {
    next(err);
  }
}

export async function deleteHito(req, res, next) {
  try {
    res.json({ ok: true, data: await desmarcarHito(req.params.id, req.params.tipo) });
  } catch (err) {
    next(err);
  }
}

// Vender: la misma venta de Vehículos, sobre la ficha publicada del ingreso.
export async function postVenta(req, res, next) {
  try {
    res.json({ ok: true, data: await venderIngreso(req.params.id, req.body ?? {}) });
  } catch (err) {
    next(err);
  }
}

export async function deleteVenta(req, res, next) {
  try {
    res.json({ ok: true, data: await deshacerVentaIngreso(req.params.id) });
  } catch (err) {
    next(err);
  }
}

// ── Contrato ──

export async function getContrato(req, res, next) {
  try {
    res.json({ ok: true, data: await obtenerContrato(req.params.id) });
  } catch (err) {
    next(err);
  }
}

export async function putContrato(req, res, next) {
  try {
    res.json({ ok: true, data: await guardarContrato(req.params.id, req.body) });
  } catch (err) {
    next(err);
  }
}

export async function postFirma(req, res, next) {
  try {
    res.json({ ok: true, data: await firmarContrato(req.params.id) });
  } catch (err) {
    next(err);
  }
}

export async function deleteFirma(req, res, next) {
  try {
    res.json({ ok: true, data: await desfirmarContrato(req.params.id) });
  } catch (err) {
    next(err);
  }
}

// Los datos de los tres impresos: contrato, recibo de documentación entregada
// y recibo de recepción de la unidad. Todos salen de la misma fuente.
export async function getImpresos(req, res, next) {
  try {
    res.json({ ok: true, data: await armarImpresos(req.params.id) });
  } catch (err) {
    next(err);
  }
}

// ── Boleto de compraventa / contrato de permuta ──
// Mismo circuito que el contrato de consignación, para la compra y la permuta.

// Envuelve un servicio (id, body) → dato en el formato de respuesta del módulo.
const responder = (servicio) => async (req, res, next) => {
  try {
    res.json({ ok: true, data: await servicio(req.params.id, req.body) });
  } catch (err) {
    next(err);
  }
};

export const getCompraventa = responder(obtenerCompraventa);
export const putCompraventa = responder(guardarCompraventa);
export const postFirmaCompraventa = responder(firmarCompraventa);
export const deleteFirmaCompraventa = responder(desfirmarCompraventa);
// Boleto (o permuta) por duplicado, recibo de documentación, recibo de
// recepción y compromiso de transferencia.
export const getImpresosCompraventa = responder(armarImpresosCompraventa);
// Venta al contado o con parte de pago: el auto de la agencia se marca vendido
// desde el legajo, no desde Vehículos.
export const postVentaCompraventa = responder(venderAutoDelBoleto);
export const deleteVentaCompraventa = responder(deshacerVentaDelBoleto);
