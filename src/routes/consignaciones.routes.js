import { Router } from "express";
import {
  getConsignaciones,
  getConsignacion,
  postConsignacion,
  patchConsignacion,
  deleteConsignacion,
} from "../controllers/consignaciones.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Requiere sesión para todo. La LECTURA la puede hacer admin o asesor;
// las MUTACIONES son exclusivas del admin.
router.use(requireAuth);
const soloAdmin = requireRole("admin");

router.get("/", getConsignaciones);
router.get("/:id", getConsignacion);

router.post("/", soloAdmin, postConsignacion);
router.patch("/:id", soloAdmin, patchConsignacion);
router.delete("/:id", soloAdmin, deleteConsignacion);

export default router;
