import "./lib/cargar-env.js";
import { crearApp } from "./app.js";
import { prisma } from "./lib/prisma.js";

const PORT = process.env.PORT || 4000;
const app = crearApp();

const server = app.listen(PORT, () => {
  console.log(`API de la agencia escuchando en http://localhost:${PORT}`);
});

// Cierre prolijo
async function shutdown() {
  console.log("\nCerrando servidor...");
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
