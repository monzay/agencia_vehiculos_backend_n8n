import { Router } from "express";
import { getSenas, getSena, postSena, patchSena, postCancelacion, postTramite, deleteSena } from "../controllers/senas.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Hay plata y datos de clientes: todo exige sesión. Ver lo puede admin o asesor
// (saber qué auto está reservado es parte de vender); cambiar algo, solo admin.
router.use(requireAuth);
const soloAdmin = requireRole("admin");

router.get("/", getSenas);
router.post("/", soloAdmin, postSena);
router.get("/:id", getSena);
router.patch("/:id", soloAdmin, patchSena);
router.delete("/:id", soloAdmin, deleteSena);
router.post("/:id/cancelacion", soloAdmin, postCancelacion);
router.post("/:id/tramite", soloAdmin, postTramite);

export default router;
