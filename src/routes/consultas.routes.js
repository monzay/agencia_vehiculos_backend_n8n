import { Router } from "express";
import { getConsultas, getConsultasVenta, getConsulta, patchAtendido } from "../controllers/consultas.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

// Lectura: cualquier sesión (admin o asesor).
router.get("/", requireAuth, getConsultas);
// Venta/consignación (una por sesión). Va ANTES de /:id para que no lo capture.
router.get("/venta", requireAuth, getConsultasVenta);
// Las "consultas nuevas" viven en /api/novedades/consultas (ver novedades.routes).
// Marcar/desmarcar atendida: admin o asesor.
router.patch("/:id/atendido", requireAuth, patchAtendido);
router.get("/:id", requireAuth, getConsulta); // detalle (mensajes de la consulta)

export default router;
