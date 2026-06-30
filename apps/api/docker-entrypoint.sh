#!/bin/sh
# Entrypoint del backend: applica le migrazioni Prisma (idempotente) e, se richiesto,
# il seed del tenant di sviluppo, poi avvia l'API. DATABASE_URL arriva da docker-compose.
set -e
cd /app

echo "[entrypoint] prisma migrate deploy..."
pnpm --filter @driftly/api exec prisma migrate deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] seed tenant di sviluppo..."
  pnpm --filter @driftly/api exec prisma db seed || echo "[entrypoint] seed saltato/errore non bloccante"
fi

echo "[entrypoint] avvio API su :${PORT:-3000}"
exec node apps/api/dist/src/main.js
