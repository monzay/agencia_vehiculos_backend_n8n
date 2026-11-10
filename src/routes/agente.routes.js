import express, { Router } from "express";
import { crearClienteAnthropic } from "../lib/anthropic.js";
import { prisma } from "../lib/prisma.js";
import { dbAgente } from "../agente/db.js";
import { atenderMensaje } from "../agente/atender.js";
import { registrarEnvioFallido } from "../agente/envio-fallido.js";
import { crearRecibirMensaje } from "../controllers/agente.controller.js";
import { requireSecretoAgente } from "../middlewares/secreto-agente.js";
import { rateLimit } from "../middlewares/rateLimit.js";

// Entrada del agente vendedor: la llama solo n8n con cada mensaje de WhatsApp.
// Se monta antes del parser JSON global (100 kb) porque puede traer una foto o un
// audio en base64; el cuerpo grande se lee recién después de validar la clave.
export function crearRouterAgente({ atender, secretoAgente, secretoMeta }) {
  const router = Router();
  router.post(
    "/mensaje",
    // La clave va primero: un pedido sin ella no le gasta el cupo a n8n.
    requireSecretoAgente(secretoAgente),
    rateLimit({ ventanaMs: 60_000, max: 300 }),
    express.json({ limit: "12mb" }),
    crearRecibirMensaje({ atender, secretoMeta })
  );
  // n8n avisa cuando Meta rechazó una respuesta: la consulta queda marcada en el panel.
  router.post("/envio-fallido", requireSecretoAgente(secretoAgente), express.json({ limit: "10kb" }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await registrarEnvioFallido(req.body ?? {}) });
    } catch (err) {
      next(err);
    }
  });
  return router;
}

let deps;
const depsReales = () => (deps ??= { root: prisma, dbAgente: dbAgente(), anthropic: crearClienteAnthropic() });

export default crearRouterAgente({
  atender: (entrada) => atenderMensaje(entrada, depsReales()),
  secretoAgente: () => process.env.AGENTE_SECRETO,
  secretoMeta: () => process.env.WA_APP_SECRET,
});
