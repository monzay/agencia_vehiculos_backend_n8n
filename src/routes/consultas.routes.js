import { Router } from "express";
import {
  getConsultas,
  getConsultasVenta,
  getConsulta,
  patchAtendido,
  postMensajeConsulta,
  postDevolverBot,
} from "../controllers/consultas.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

// Lectura: cualquier sesión (admin o asesor).
router.get("/", requireAuth, getConsultas);
// Venta/consignación (una por sesión). Va ANTES de /:id para que no lo capture.
router.get("/venta", requireAuth, getConsultasVenta);
// Las "consultas nuevas" viven en /api/novedades/consultas (ver novedades.routes).
// Marcar/desmarcar atendida: admin o asesor.
router.patch("/:id/atendido", requireAuth, patchAtendido);
// Intervención humana: responder desde el panel (pausa el bot) y devolver la conversación al bot.
router.post("/:id/mensaje", requireAuth, postMensajeConsulta);
router.post("/:id/devolver", requireAuth, postDevolverBot);
router.get("/:id", requireAuth, getConsulta); // detalle (chat completo de la consulta)

export default router;
