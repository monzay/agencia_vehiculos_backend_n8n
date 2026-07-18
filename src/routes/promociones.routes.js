import { Router } from "express";
import {
  getPromociones,
  getPromocion,
  postPromocion,
  patchPromocion,
  deletePromocion,
  aplicarAPromocion,
  quitarPromocion,
} from "../controllers/promociones.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Requiere sesión para todo. La LECTURA la puede hacer admin o asesor;
// las MUTACIONES son exclusivas del admin (requireRole corta a los asesores).
router.use(requireAuth);
const soloAdmin = requireRole("admin");

// Lectura (admin o asesor).
router.get("/", getPromociones);

// Mutaciones (solo admin).
router.post("/", soloAdmin, postPromocion);
// Aplicar / quitar de uno o varios vehiculos (body: { refs: [...] }).
router.post("/:id/aplicar", soloAdmin, aplicarAPromocion);
router.post("/:id/quitar", soloAdmin, quitarPromocion);

router.get("/:id", getPromocion);
router.patch("/:id", soloAdmin, patchPromocion);
router.delete("/:id", soloAdmin, deletePromocion);

export default router;
