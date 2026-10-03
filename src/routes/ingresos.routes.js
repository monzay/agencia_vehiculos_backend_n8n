import { Router } from "express";
import {
  getCatalogoDocumentos,
  getPersonas,
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
} from "../controllers/ingresos.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { rateLimit } from "../middlewares/rateLimit.js";

const router = Router();

// Todo el módulo exige sesión: acá hay DNI, CUIT y CBU de clientes reales.
// La LECTURA la puede hacer admin o asesor; las MUTACIONES son del admin.
router.use(requireAuth);
const soloAdmin = requireRole("admin");

// Antes de "/:id", si no "catalogo" y "personas" se leerían como ids.
router.get("/catalogo", getCatalogoDocumentos);
router.get("/personas", getPersonas);

router.get("/", getIngresos);
router.post("/", soloAdmin, postIngreso);

router.get("/:id", getIngreso);
router.patch("/:id", soloAdmin, patchIngreso);
router.delete("/:id", soloAdmin, deleteIngreso);

// Cada lectura automática cuesta plata y tarda: se limita por usuario, no por
// IP, para que un panel abierto en varias máquinas no comparta el cupo.
const limiteExtraccion = rateLimit({
  ventanaMs: 60_000,
  max: 20,
  clave: (req) => String(req.usuario?.id ?? req.ip),
  mensaje: "Demasiadas lecturas seguidas. Esperá un minuto.",
});

router.get("/:id/documentos", getDocumentos);
// Firmar es leer: mismo permiso que ver la lista de papeles. Si un asesor puede
// ver que hay un DNI cargado, puede abrirlo; negarle la firma dejaría el
// pathname que ya recibe convertido en un dato inútil.
router.post("/:id/documentos/firmar", postFirmaImagenes);
router.post("/:id/documentos/extraer", soloAdmin, limiteExtraccion, postExtraccion);
router.put("/:id/documentos", soloAdmin, putDocumento);
router.delete("/:id/documentos/:documentoId", soloAdmin, deleteDocumento);

router.post("/:id/estado", soloAdmin, postEstado);
router.post("/:id/venta", soloAdmin, postVenta);

router.get("/:id/contrato", getContrato);
router.put("/:id/contrato", soloAdmin, putContrato);
router.post("/:id/contrato/firma", soloAdmin, postFirma);
router.delete("/:id/contrato/firma", soloAdmin, deleteFirma);

router.get("/:id/impresos", getImpresos);

// Compra y permuta: el boleto reemplaza al contrato de consignación.
router.get("/:id/compraventa", getCompraventa);
router.put("/:id/compraventa", soloAdmin, putCompraventa);
router.post("/:id/compraventa/firma", soloAdmin, postFirmaCompraventa);
router.delete("/:id/compraventa/firma", soloAdmin, deleteFirmaCompraventa);
router.get("/:id/compraventa/impresos", getImpresosCompraventa);

export default router;
