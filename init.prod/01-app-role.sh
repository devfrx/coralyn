#!/bin/bash
# Init di PRODUZIONE del ruolo applicativo RLS.
#
# Eseguito da postgres SOLO al primo avvio (data dir vuota). A differenza della
# versione dev (init/01-app-role.sql, con password e nome DB hardcoded), qui:
#   - la password di coralyn_app arriva da $APP_DB_PASSWORD (env, forte);
#   - il nome del DB arriva da $POSTGRES_DB (non si crea il DB di test);
#   - coralyn_app resta NOSUPERUSER NOBYPASSRLS: NON può aggirare la RLS (essenziale).
# Le policy RLS vere sono create dalle migrazioni Prisma (migrate deploy all'avvio api),
# eseguite da coralyn_app che possiede lo schema public.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE ROLE coralyn_app WITH LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOBYPASSRLS CREATEDB;
	GRANT ALL ON DATABASE ${POSTGRES_DB} TO coralyn_app;
	ALTER SCHEMA public OWNER TO coralyn_app;
EOSQL

echo "[init.prod] ruolo coralyn_app creato su ${POSTGRES_DB} (NOBYPASSRLS)."
