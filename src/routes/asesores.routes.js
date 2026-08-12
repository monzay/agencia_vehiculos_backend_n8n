import { Router } from "express";
import {
  getAsesores,
  getAsesor,
  getAsesorPorSlug,
  postAsesor,
  patchAsesor,
  deleteAsesor,
} from "../controllers/asesores.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Gestión de asesores: SOLO admin. Un asesor no puede ver ni administrar el
// roster (crear/editar/eliminar otros asesores). CRUD completo reservado a admin.
// Excepción PÚBLICA: resolver el slug de un link de captación. Lo consulta un
// visitante sin sesión y solo devuelve nombre + slug (ver el service).
router.get("/slug/:slug", getAsesorPorSlug);

const soloAdmin = [requireAuth, requireRole("admin")];
router.get("/", ...soloAdmin, getAsesores);
router.get("/:id", ...soloAdmin, getAsesor);
router.post("/", ...soloAdmin, postAsesor);
router.patch("/:id", ...soloAdmin, patchAsesor);
router.delete("/:id", ...soloAdmin, deleteAsesor);

export default router;
