import "dotenv/config";
import { crearApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { marcarFriasLasAbandonadas } from "./agente/abandonadas.js";

const PORT = process.env.PORT || 4000;
const app = crearApp();

const server = app.listen(PORT, () => {
  console.log(`API de la agencia escuchando en http://localhost:${PORT}`);
});

// Cada hora: las consultas sin respuesta hace 24 h pasan a frías.
const UNA_HORA_MS = 3_600_000;
const marcarFrias = () =>
  marcarFriasLasAbandonadas({ db: prisma })
    .then((n) => n > 0 && console.log(`[consultas] ${n} sin respuesta en 24 h pasaron a frías`))
    .catch((err) => console.error("[consultas] no se pudieron marcar las abandonadas:", err?.message));
marcarFrias();
const reloj = setInterval(marcarFrias, UNA_HORA_MS);

// Cierre prolijo
async function shutdown() {
  console.log("\nCerrando servidor...");
  clearInterval(reloj);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
