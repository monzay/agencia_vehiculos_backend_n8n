import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireSecretoAgente } from "../middlewares/secreto-agente.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import { prepararAvisosDelDia, registrarResultado } from "../services/avisos-cuotas.service.js";

// Recordatorios de cuotas: solo n8n, con la misma clave que el cartero. Una vez
// por día pide la lista de mensajes y después informa cómo salió cada uno.

const resultadoSchema = z.strictObject({
  ok: z.boolean(),
  wamid: z.string().max(128).nullish(),
  error: z.string().max(1000).nullish(),
});
const idSchema = z.coerce.number().int().positive();

export function crearRouterAvisosCuotas({ secretoAgente, preparar, registrar }) {
  const router = Router();
  router.use(requireSecretoAgente(secretoAgente), rateLimit({ ventanaMs: 60_000, max: 600 }), express.json({ limit: "10kb" }));

  router.post("/avisos-del-dia", async (req, res, next) => {
    try {
      res.json({ ok: true, envios: await preparar() });
    } catch (err) {
      next(err);
    }
  });

  router.post("/avisos/:id/resultado", async (req, res, next) => {
    const avisoId = idSchema.safeParse(req.params.id);
    const cuerpo = resultadoSchema.safeParse(req.body);
    if (!avisoId.success || !cuerpo.success) return res.status(400).json({ ok: false, error: "Pedido inválido." });
    try {
      const { ok, wamid, error } = cuerpo.data;
      const registrado = await registrar({ avisoId: avisoId.data, ok, wamid: wamid ?? null, error: error ?? null });
      res.json({ ok: true, registrado });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default crearRouterAvisosCuotas({
  secretoAgente: () => process.env.AGENTE_SECRETO,
  preparar: () => prepararAvisosDelDia({ db: prisma }),
  registrar: (r) => registrarResultado({ db: prisma, ...r }),
});
