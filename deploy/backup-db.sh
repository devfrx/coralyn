#!/usr/bin/env bash
# Backup del database Coralyn (produzione). Da lanciare sul VPS, anche via cron.
#
# Cosa fa: pg_dump dell'intero DB (compresso .gz), con ritenzione locale di 14 giorni.
# Uso manuale:   ./deploy/backup-db.sh
# Cron (ogni notte alle 3:00) — vedi guida, Passo 8:
#   0 3 * * * /percorso/coralyn/deploy/backup-db.sh >> /var/log/coralyn-backup.log 2>&1
#
# REGOLA D'ORO: un backup mai ripristinato non è un backup. Prova il restore
# almeno una volta (istruzioni nella guida).
set -euo pipefail

# Vai alla root del repo (questo script sta in deploy/).
cd "$(dirname "$0")/.."

# Leggi SOLO le due variabili che servono (niente `source`: MAIL_FROM ha spazi/<>).
POSTGRES_USER=$(grep -E '^POSTGRES_USER=' .env.prod | cut -d= -f2-)
POSTGRES_DB=$(grep -E '^POSTGRES_DB=' .env.prod | cut -d= -f2-)

OUT_DIR="${BACKUP_DIR:-/var/backups/coralyn}"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT_FILE="$OUT_DIR/coralyn-$STAMP.sql.gz"
mkdir -p "$OUT_DIR"

# -T: niente TTY (necessario in cron). Dump come superuser del DB (backup completo).
docker compose -f docker-compose.prod.yml exec -T db \
	pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
	| gzip > "$OUT_FILE"

# Ritenzione: elimina i dump più vecchi di 14 giorni.
find "$OUT_DIR" -name 'coralyn-*.sql.gz' -mtime +14 -delete

echo "[backup] $(date '+%F %T') -> $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

# ---- OFFSITE (fortemente consigliato) ----
# Un backup solo sul VPS muore col VPS. Copialo su uno storage esterno economico
# (Backblaze B2 o Cloudflare R2) con rclone. Dopo aver configurato `rclone config`,
# decommenta:
# rclone copy "$OUT_FILE" coralyn-backup:coralyn-db/ && echo "[backup] copia offsite ok"
