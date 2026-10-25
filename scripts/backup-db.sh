#!/usr/bin/env bash
# Dumps the Herní večer database (pg_dump custom format) and rotates old dumps.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

DB_CONTAINER="${DB_CONTAINER:-domaci-liga-db-1}"
POSTGRES_USER="${POSTGRES_USER:-domaci_liga}"
DB_NAME="${DB_NAME:-domaci_liga}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/domaci-liga}"
KEEP_DAYS="${KEEP_DAYS:-14}"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

out="$BACKUP_DIR/${DB_NAME}-$(date +%Y%m%d-%H%M%S).dump"
tmp="$out.tmp"
trap 'rm -f "$tmp"' EXIT

docker exec "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$DB_NAME" --format=custom > "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$out"

find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}-*.dump" -mtime +"$KEEP_DAYS" -delete

echo "[backup] ok: $out ($(du -h "$out" | cut -f1))"
