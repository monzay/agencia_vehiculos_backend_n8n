import { Router } from "express";
import {
  putHito,
  deleteHito,
  getCatalogoDocumentos,
  getPersonas,
  getPrecarga,
  getIngresos,
  getIngreso,
  postIngreso,
  patchIngreso,
  deleteIngreso,
  getDocumentos,
  putDocumento,
  deleteDocumento,
  postExtraccion,
  postFirmaImagenes,
  postEstado,
  postVenta,
  deleteVenta,
  getContrato,
  putContrato,
  postFirma,
  deleteFirma,
  getImpresos,
  getCompraventa,
  putCompraventa,
  postFirmaCompraventa,
  deleteFirmaCompraventa,
  getImpresosCompraventa,
  postVentaCompraventa,
  deleteVentaCompraventa,
  postFinanciacionIngreso,
} from "../controllers/ingresos.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { rateLimit } from "../middlewares/rateLimit.js";

const router = Router();

// Documentos: acá hay DNI, CUIT y CBU de clientes reales, contratos y montos.
// Todo el módulo es solo del admin, también para leer (decisión del 16/10/2026).
router.use(requireAuth, requireRole("admin"));

// Antes de "/:id", si no "catalogo" y "personas" se leerían como ids.
router.get("/catalogo", getCatalogoDocumentos);
router.get("/personas", getPersonas);
router.get("/precarga/:sesionId", getPrecarga);

router.get("/", getIngresos);
router.post("/", postIngreso);

router.get("/:id", getIngreso);
router.patch("/:id", patchIngreso);
router.delete("/:id", deleteIngreso);

// Cada lectura automática cuesta plata y tarda: se limita por usuario, no por
// IP, para que un panel abierto en varias máquinas no comparta el cupo.
const limiteExtraccion = rateLimit({
  ventanaMs: 60_000,
  max: 20,
  clave: (req) => String(req.usuario?.id ?? req.ip),
  mensaje: "Demasiadas lecturas seguidas. Esperá un minuto.",
});

router.get("/:id/documentos", getDocumentos);
// Firmar es leer: mismo permiso que ver la lista de papeles.
router.post("/:id/documentos/firmar", postFirmaImagenes);
router.post("/:id/documentos/extraer", limiteExtraccion, postExtraccion);
router.put("/:id/documentos", putDocumento);
router.delete("/:id/documentos/:documentoId", deleteDocumento);

router.post("/:id/estado", postEstado);
router.post("/:id/venta", postVenta);
router.delete("/:id/venta", deleteVenta);

router.get("/:id/contrato", getContrato);
router.put("/:id/contrato", putContrato);
router.post("/:id/contrato/firma", postFirma);
router.delete("/:id/contrato/firma", deleteFirma);

router.get("/:id/impresos", getImpresos);

// Compra y permuta: el boleto reemplaza al contrato de consignación.
router.get("/:id/compraventa", getCompraventa);
router.put("/:id/compraventa", putCompraventa);
router.post("/:id/compraventa/firma", postFirmaCompraventa);
router.delete("/:id/compraventa/firma", deleteFirmaCompraventa);
router.get("/:id/compraventa/impresos", getImpresosCompraventa);
router.post("/:id/compraventa/venta", postVentaCompraventa);
router.delete("/:id/compraventa/venta", deleteVentaCompraventa);
router.put("/:id/hitos/:tipo", putHito);
router.delete("/:id/hitos/:tipo", deleteHito);

// Financiación del saldo de la parte de pago. Se edita después por
// PATCH /api/financiaciones/:id, como cualquier otra financiación.
router.post("/:id/financiacion", postFinanciacionIngreso);

export default router;
