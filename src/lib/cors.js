// Opciones de CORS a partir de CORS_ORIGIN.
// - "*"  -> permite cualquier origen.
// - Lista separada por comas -> solo esos orígenes (p.ej. "http://localhost:3000,http://localhost:3001").
// Las peticiones sin Origin (curl, server-to-server, healthchecks) siempre pasan.
export function opcionesCors() {
  const raw = (process.env.CORS_ORIGIN || "*").trim();
  if (raw === "*") {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[CORS] CORS_ORIGIN no configurado: se acepta CUALQUIER origen. Definí una allowlist explícita (dominios del front) en producción."
      );
    }
    return { origin: "*" };
  }

  const permitidos = raw.split(",").map((o) => o.trim()).filter(Boolean);
  // Los deploys y previews de Vercel usan URLs con hash que cambian en cada
  // build (ej. ...-eo1uel32r-monzays-projects.vercel.app). Se aceptan por patron
  // ademas de la lista exacta, para no romper el login en cada deploy.
  const patronVercel = /^https:\/\/agencia-vehiculos-frontend[a-z0-9-]*\.vercel\.app$/;
  return {
    origin(origin, callback) {
      // Origen permitido -> se refleja; no permitido -> se niega sin header
      // (el navegador bloquea) en vez de lanzar un 500.
      const permitido =
        !origin || permitidos.includes(origin) || patronVercel.test(origin);
      callback(null, permitido);
    },
  };
}
