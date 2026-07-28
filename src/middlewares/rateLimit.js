// Rate limiter en memoria (ventana fija). Frena fuerza bruta, enumeración y
// abuso de endpoints públicos sin dependencias externas.
//
// Ámbito: UNA sola instancia. El contador vive en el proceso; si algún día se
// corre en varias réplicas, reemplazar `almacen` por un store compartido
// (Redis) para que el límite sea global y no por-proceso.
//
// Requiere que Express tenga bien seteado `trust proxy` (ver app.js) para que
// `req.ip` sea la IP real del cliente detrás del reverse proxy (Caddy), no la
// del proxy — de lo contrario todos caerían en el mismo cubo.

const almacen = new Map(); // clave -> { conteo, resetEn }

// Limpieza periódica de entradas vencidas para no acumular memoria.
setInterval(() => {
  const ahora = Date.now();
  for (const [k, v] of almacen) if (v.resetEn <= ahora) almacen.delete(k);
}, 60_000).unref();

// Crea un middleware que permite `max` peticiones por `ventanaMs` y por cubo.
// `clave(req)` decide el cubo (por defecto la IP). Para el login conviene
// combinar IP + identificador (email) y así no castigar a toda una red.
export function rateLimit({ ventanaMs, max, clave = (req) => req.ip, mensaje }) {
  return (req, res, next) => {
    const cubo = `${req.baseUrl}${req.path}|${clave(req)}`;
    const ahora = Date.now();

    let e = almacen.get(cubo);
    if (!e || e.resetEn <= ahora) {
      e = { conteo: 0, resetEn: ahora + ventanaMs };
      almacen.set(cubo, e);
    }
    e.conteo += 1;

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - e.conteo)));

    if (e.conteo > max) {
      res.setHeader("Retry-After", String(Math.ceil((e.resetEn - ahora) / 1000)));
      return res.status(429).json({
        ok: false,
        error: mensaje || "Demasiadas solicitudes. Esperá un momento y probá de nuevo.",
      });
    }
    next();
  };
}
