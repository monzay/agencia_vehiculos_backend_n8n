import { createHash, timingSafeEqual } from "node:crypto";

// Solo n8n puede hablarle al agente: comparte una clave larga con el backend
// (AGENTE_SECRETO) que manda en el header `x-agente-secreto`. Sin clave
// configurada, o si es corta, el agente no atiende.

const LARGO_MINIMO = 32;

const resumen = (valor) => createHash("sha256").update(String(valor)).digest();

export function requireSecretoAgente(obtenerSecreto) {
  return (req, res, next) => {
    const esperado = obtenerSecreto();
    if (!esperado || esperado.length < LARGO_MINIMO) {
      return next(Object.assign(new Error("El agente no está configurado (falta AGENTE_SECRETO)."), { status: 503, publico: true }));
    }
    // Se comparan los resúmenes: mismo largo y en tiempo constante.
    if (!timingSafeEqual(resumen(req.get("x-agente-secreto") ?? ""), resumen(esperado))) {
      return res.status(401).json({ ok: false, error: "No autorizado." });
    }
    next();
  };
}
