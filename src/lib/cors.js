// Opciones de CORS a partir de CORS_ORIGIN.
// - "*"  -> permite cualquier origen.
// - Lista separada por comas -> solo esos orígenes (p.ej. "http://localhost:3000,http://localhost:3001").
// Las peticiones sin Origin (curl, server-to-server, healthchecks) siempre pasan.
export function opcionesCors() {
  const raw = (process.env.CORS_ORIGIN || "*").trim();
  if (raw === "*") return { origin: "*" };

  const permitidos = raw.split(",").map((o) => o.trim()).filter(Boolean);
  return {
    origin(origin, callback) {
      // Origen permitido -> se refleja; no permitido -> se niega sin header
      // (el navegador bloquea) en vez de lanzar un 500.
      callback(null, !origin || permitidos.includes(origin));
    },
  };
}
