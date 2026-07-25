#!/bin/sh
# Entrypoint del backend: applica le migrazioni Prisma (idempotente) e, se richiesto,
# il seed del tenant di sviluppo, poi avvia l'API. DATABASE_URL arriva da docker-compose.
set -e
cd /app

echo "[entrypoint] prisma migrate deploy..."
pnpm --filter @coralyn/api exec prisma migrate deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] seed tenant di sviluppo + admin..."
  # NODE_ENV=development serve al resto della toolchain, non piu' a scavalcare una guardia: il
  # seed si difende ora sul nome del database (prisma/dev-database.ts), che questo script non
  # puo' falsificare. Su un DB che non sia coralyn_dev/coralyn_test si rifiuta e basta.
  #
  # Nessun `|| echo`: mascherava OGNI fallimento come "non bloccante", quindi un seed andato
  # male lasciava partire un'API senza admin e senza un errore. `set -e` lo rende fatale — che
  # e' il punto: SEED_ON_START=true e' una richiesta esplicita, se non riesce va detto.
  NODE_ENV=development pnpm --filter @coralyn/api exec prisma db seed
fi

echo "[entrypoint] avvio API su :${PORT:-3000}"
exec node apps/api/dist/src/main.js
