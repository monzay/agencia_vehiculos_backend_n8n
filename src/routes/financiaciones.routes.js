import { Router } from "express";
import {
  getFinanciaciones,
  getFinanciacion,
  postFinanciacion,
  patchFinanciacion,
  putCuota,
  deleteFinanciacion,
  getConsultaPorDni,
} from "../controllers/financiaciones.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// PÚBLICO (sin auth): el cliente consulta su financiación por DNI.
// Debe ir ANTES de "/:id" para que "consulta" no se interprete como un id.
router.get("/consulta", getConsultaPorDni);

// Gestión de financiaciones: SOLO admin (ver, crear, editar, marcar cuotas y eliminar).
const soloAdmin = [requireAuth, requireRole("admin")];
router.get("/", ...soloAdmin, getFinanciaciones);
router.get("/:id", ...soloAdmin, getFinanciacion);
router.post("/", ...soloAdmin, postFinanciacion);
router.patch("/:id", ...soloAdmin, patchFinanciacion);
// Marca/desmarca una cuota como pagada: body { pagado: boolean }.
router.put("/:id/cuotas/:numero", ...soloAdmin, putCuota);
router.delete("/:id", ...soloAdmin, deleteFinanciacion);

export default router;
