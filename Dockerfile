# ─── Estágio de build ────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Instala dependências primeiro (melhor cache do Docker)
COPY package*.json ./
RUN npm install --only=production

# ─── Estágio final (imagem mínima) ───────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copia dependências e código
COPY --from=builder /app/node_modules ./node_modules
COPY server.js links.json ./

# Cloud Run exige que o app escute na porta definida por $PORT
# O valor padrão é 8080
ENV PORT=8080
ENV NODE_ENV=production

# Expõe a porta (documentação, não obrigatório no Cloud Run)
EXPOSE 8080

# Inicia o servidor
CMD ["node", "server.js"]
