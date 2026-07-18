import { Router } from "express";
import {
  getDescuentos,
  getDescuento,
  postDescuento,
  patchDescuento,
  deleteDescuento,
  aplicarADescuento,
  quitarDescuento,
} from "../controllers/descuentos.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Requiere sesión para todo. La LECTURA la puede hacer admin o asesor;
// las MUTACIONES son exclusivas del admin (requireRole corta a los asesores).
router.use(requireAuth);
const soloAdmin = requireRole("admin");

// Lectura (admin o asesor).
router.get("/", getDescuentos);

// Mutaciones (solo admin).
router.post("/", soloAdmin, postDescuento);
// Aplicar / quitar un descuento de uno o varios vehiculos (body: { refs: [...] }).
router.post("/:id/aplicar", soloAdmin, aplicarADescuento);
router.post("/quitar", soloAdmin, quitarDescuento);

router.get("/:id", getDescuento);
router.patch("/:id", soloAdmin, patchDescuento);
router.delete("/:id", soloAdmin, deleteDescuento);

export default router;
