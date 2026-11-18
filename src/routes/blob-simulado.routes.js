// Sirve las fotos del Blob simulado (ver lib/blob-privado.js). Existe solo en desarrollo: con NODE_ENV=production
// o sin BLOB_SIMULADO=1 no hay ruta (devuelve null y la app no la monta).
import { Router } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CARPETA_BLOB_SIMULADO, blobSimulado } from "../lib/blob-privado.js";

const TIPOS = { ".jpg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };

export function crearRutaBlobSimulado({ carpeta = CARPETA_BLOB_SIMULADO, env = process.env } = {}) {
  if (!blobSimulado(env)) return null;
  const raiz = path.resolve(carpeta);
  const router = Router();
  router.get(/^\/(.+)$/, async (req, res) => {
    let pedido;
    try {
      pedido = decodeURIComponent(req.params[0]);
    } catch {
      return res.status(400).json({ error: "Ruta inválida" });
    }
    const partes = pedido.split("/");
    if (partes.some((p) => p === "" || p === "." || p === "..") || /[\\0:]/.test(pedido)) {
      return res.status(400).json({ error: "Ruta inválida" });
    }
    const archivo = path.resolve(raiz, ...partes);
    if (!archivo.startsWith(raiz + path.sep)) return res.status(400).json({ error: "Ruta inválida" });
    try {
      const contenido = await readFile(archivo);
      res.type(TIPOS[path.extname(archivo).toLowerCase()] ?? "application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(contenido);
    } catch {
      return res.status(404).json({ error: "No existe" });
    }
  });
  return router;
}
