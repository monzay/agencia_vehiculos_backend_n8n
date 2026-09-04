import express from "express";
import cors from "cors";
import morgan from "morgan";

import vehiculosRoutes from "./routes/vehiculos.routes.js";
import descuentosRoutes from "./routes/descuentos.routes.js";
import promocionesRoutes from "./routes/promociones.routes.js";
import leadsRoutes from "./routes/leads.routes.js";
import consultasRoutes from "./routes/consultas.routes.js";
import novedadesRoutes from "./routes/novedades.routes.js";
import financiacionesRoutes from "./routes/financiaciones.routes.js";
import asesoresRoutes from "./routes/asesores.routes.js";
import authRoutes from "./routes/auth.routes.js";
import usuariosRoutes from "./routes/usuarios.routes.js";
import configRoutes from "./routes/config.routes.js";
import ubicacionRoutes from "./routes/ubicacion.routes.js";
import horariosRoutes from "./routes/horarios.routes.js";
import consignacionesRoutes from "./routes/consignaciones.routes.js";
import entregasRoutes from "./routes/entregas.routes.js";
import contabilidadRoutes from "./routes/contabilidad.routes.js";
import { notFound, errorHandler } from "./middlewares/error.js";
import { opcionesCors } from "./lib/cors.js";

export function crearApp() {
  const app = express();

  // Detrás de un reverse proxy (Caddy): confiar en el primer salto para que
  // `req.ip` sea la IP real del cliente (la usa el rate limiter), sin permitir
  // que un cliente directo falsifique X-Forwarded-For.
  app.set("trust proxy", 1);
  app.disable("x-powered-by"); // no revelar que corre Express

  // Cabeceras de seguridad para la API. La CSP fuerte vive en el front; en una
  // API JSON detrás de HTTPS lo relevante es no dejar adivinar el tipo de
  // contenido, forzar HTTPS y no filtrar el referer.
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  app.use(cors(opcionesCors()));
  app.use(express.json());
  app.use(morgan("dev"));

  // Healthcheck
  app.get("/health", (req, res) => res.json({ ok: true, service: "agencia-api" }));

  // API
  app.use("/api/auth", authRoutes);
  app.use("/api/usuarios", usuariosRoutes);
  app.use("/api/config", configRoutes);
  app.use("/api/ubicacion", ubicacionRoutes);
  app.use("/api/horarios", horariosRoutes);
  app.use("/api/consignaciones", consignacionesRoutes);
  app.use("/api/entregas", entregasRoutes);
  app.use("/api/vehiculos", vehiculosRoutes);
  app.use("/api/descuentos", descuentosRoutes);
  app.use("/api/promociones", promocionesRoutes);
  app.use("/api/leads", leadsRoutes);
  app.use("/api/consultas", consultasRoutes);
  app.use("/api/novedades", novedadesRoutes);
  app.use("/api/financiaciones", financiacionesRoutes);
  app.use("/api/asesores", asesoresRoutes);
  app.use("/api/contabilidad", contabilidadRoutes);

  // Errores
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
