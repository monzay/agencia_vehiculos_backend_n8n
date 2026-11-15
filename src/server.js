import "./lib/cargar-env.js";
import { crearApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { dbAgente } from "./agente/db.js";
import { crearClienteAnthropic } from "./lib/anthropic.js";
import { crearEnvioWhatsapp } from "./agente/whatsapp-envio.js";
import { iniciarRecordatorios } from "./agente/recordatorio.js";

const PORT = process.env.PORT || 4000;
const app = crearApp();

const server = app.listen(PORT, () => {
  console.log(`API de la agencia escuchando en http://localhost:${PORT}`);
});

// Recordatorio a los 10 minutos al cliente que dejó sin contestar una pregunta del bot (se apaga con
// RECORDATORIO_MINUTOS=0). Solo arranca acá: ningún módulo ni test lo arranca al importarse.
let recordatorios = null;
try {
  recordatorios = iniciarRecordatorios({ root: prisma, dbAgente: dbAgente(), anthropic: crearClienteAnthropic(), enviar: crearEnvioWhatsapp().enviarTexto });
} catch (err) {
  console.error("[recordatorio] no arrancó:", err?.message);
}

// Cierre prolijo
async function shutdown() {
  console.log("\nCerrando servidor...");
  recordatorios?.detener();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
