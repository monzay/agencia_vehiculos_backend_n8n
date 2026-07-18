# Backend API de la agencia (Node + Express + Prisma)
FROM node:22-slim

# Prisma necesita openssl para su motor de consultas
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias (incluye la CLI de Prisma para generar el cliente)
COPY package.json package-lock.json ./
RUN npm ci

# Generar el cliente de Prisma para Linux
COPY prisma ./prisma
RUN npx prisma generate

# Codigo de la aplicacion
COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/server.js"]
