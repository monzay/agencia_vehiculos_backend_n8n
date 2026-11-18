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
import ingresosRoutes from "./routes/ingresos.routes.js";
import senasRoutes from "./routes/senas.routes.js";
import preparacionesRoutes from "./routes/preparaciones.routes.js";
import entregasRoutes from "./routes/entregas.routes.js";
import contabilidadRoutes from "./routes/contabilidad.routes.js";
import iaRoutes from "./routes/ia.routes.js";
import agenteRoutes from "./routes/agente.routes.js";
import avisosCuotasRoutes from "./routes/avisos-cuotas.routes.js";
import terminosRoutes from "./routes/terminos.routes.js";
import { crearRutaBlobSimulado } from "./routes/blob-simulado.routes.js";
import { notFound, errorHandler } from "./middlewares/error.js";
import { opcionesCors } from "./lib/cors.js";
import { urlSinDatosPersonales } from "./lib/log-seguro.js";

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
  // El formato "dev" escribe `:url` entero: sin esto el log guarda los DNIs, teléfonos y
  // búsquedas que viajan en la query string. El token es global de morgan.
  morgan.token("url", (req) => urlSinDatosPersonales(req.originalUrl || req.url));
  app.use(morgan("dev"));
  // Antes del parser global: trae fotos y audios, con su propio límite (ver la ruta).
  app.use("/api/agente/cuotas", avisosCuotasRoutes);
  app.use("/api/agente", agenteRoutes);
  app.use(express.json());

  // Solo en desarrollo con BLOB_SIMULADO=1: sirve las fotos que el Blob simulado guarda en disco. En producción es null.
  const blobSimulado = crearRutaBlobSimulado();
  if (blobSimulado) app.use("/api/dev/blob-simulado", blobSimulado);

  // Healthcheck
  app.get("/health", (req, res) => res.json({ ok: true, service: "agencia-api" }));

  // API
  app.use("/api/auth", authRoutes);
  app.use("/api/usuarios", usuariosRoutes);
  app.use("/api/config", configRoutes);
  app.use("/api/ubicacion", ubicacionRoutes);
  app.use("/api/privacidad", terminosRoutes);
  app.use("/api/horarios", horariosRoutes);
  app.use("/api/consignaciones", consignacionesRoutes);
  app.use("/api/ingresos", ingresosRoutes);
  app.use("/api/senas", senasRoutes);
  app.use("/api/preparaciones", preparacionesRoutes);
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
  app.use("/api/ia", iaRoutes);

  // Errores
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
