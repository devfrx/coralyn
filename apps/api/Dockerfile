# syntax=docker/dockerfile:1
#
# Immagine del backend NestJS (@driftly/api) per il monorepo pnpm.
# Il contesto di build è la ROOT del repo (vedi docker-compose.yml) così da avere
# accesso a pnpm-workspace.yaml, al lockfile e a packages/contracts (workspace dep).
#
# Sequenza critica (scoperta in fase di setup):
#   1. install filtrato a @driftly/api... (api + sue dipendenze, incl. contracts)
#   2. build di @driftly/contracts (CJS, consumato da api via dist)
#   3. prisma generate  ← OBBLIGATORIO prima della build, altrimenti i tipi del
#      client Prisma non esistono e `nest build` fallisce con TS7006 (implicit any)
#   4. nest build  → dist/src/main.js
FROM node:22-bookworm-slim

# Prisma richiede openssl a runtime per il query engine.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH="/pnpm:$PATH"
RUN corepack enable

WORKDIR /app

# Il contesto è già ripulito dal .dockerignore (niente node_modules/dist host).
COPY . .

# --ignore-scripts: evita che il `prepare` di root provi a buildare contracts
# prima del tempo; lo facciamo noi esplicitamente subito dopo.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@driftly/api..." \
 && pnpm --filter @driftly/contracts build \
 && pnpm --filter @driftly/api exec prisma generate \
 && pnpm --filter @driftly/api build

RUN chmod +x apps/api/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Healthcheck sull'endpoint /health (montato fuori dal prefisso /api).
HEALTHCHECK --interval=10s --timeout=4s --start-period=40s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/app/apps/api/docker-entrypoint.sh"]
