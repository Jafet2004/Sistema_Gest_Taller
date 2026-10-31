# syntax=docker/dockerfile:1

# ---------- Etapa 1: dependencias ----------
# Se instalan aparte para que Docker reutilice esta capa mientras no cambien
# package.json / package-lock.json (los builds de cada commit son mucho más rápidos).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- Etapa 2: imagen final ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

# No corre como root: si alguien vulnera la API, queda con permisos mínimos
USER node
EXPOSE 3000

# Docker marca el contenedor "unhealthy" si la API o la BD no responden
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
