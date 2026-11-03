import { Router } from "express";
import { getPreparaciones, getPreparacion, patchPreparacion, postPublicacion, deletePublicacion } from "../controllers/preparaciones.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// El asesor lee, sin el valor de toma ni el titular. Editar y publicar son del admin.
router.use(requireAuth);

const soloAdmin = requireRole("admin");

router.get("/", getPreparaciones);
router.get("/:id", getPreparacion);
router.patch("/:id", soloAdmin, patchPreparacion);
router.post("/:id/publicacion", soloAdmin, postPublicacion);
router.delete("/:id/publicacion", soloAdmin, deletePublicacion);

export default router;
