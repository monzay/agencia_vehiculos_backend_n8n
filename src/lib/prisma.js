import { PrismaClient } from "@prisma/client";

// Cliente Prisma unico para toda la app (evita abrir conexiones de mas).
export const prisma = new PrismaClient({
  log: ["warn", "error"],
});
