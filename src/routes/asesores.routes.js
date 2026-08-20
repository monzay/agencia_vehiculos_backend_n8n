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

// Gestión de asesores: el asesor puede VER el roster (solo lectura). Crear,
// editar y eliminar queda reservado a admin.
// Excepción PÚBLICA: resolver el slug de un link de captación. Lo consulta un
// visitante sin sesión y solo devuelve nombre + slug (ver el service).
router.get("/slug/:slug", getAsesorPorSlug);

const soloAdmin = [requireAuth, requireRole("admin")];
const adminOAsesor = [requireAuth, requireRole("admin", "asesor")];
router.get("/", ...adminOAsesor, getAsesores);
router.get("/:id", ...soloAdmin, getAsesor);
router.post("/", ...soloAdmin, postAsesor);
router.patch("/:id", ...soloAdmin, patchAsesor);
router.delete("/:id", ...soloAdmin, deleteAsesor);

export default router;
