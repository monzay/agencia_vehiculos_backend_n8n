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
import { rateLimit } from "../middlewares/rateLimit.js";

const router = Router();

// PÚBLICO (sin auth): el cliente consulta su financiación por DNI.
// Debe ir ANTES de "/:id" para que "consulta" no se interprete como un id.
// Rate limit por IP para frenar la enumeración de DNIs (un cliente legítimo
// consulta su propio DNI unas pocas veces; enumerar requiere muchos por IP).
const limiteConsulta = rateLimit({
  ventanaMs: 60 * 1000,
  max: 10,
  mensaje: "Demasiadas consultas seguidas. Esperá un minuto y volvé a intentar.",
});
router.get("/consulta", limiteConsulta, getConsultaPorDni);

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
