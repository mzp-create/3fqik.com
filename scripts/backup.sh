#!/usr/bin/env bash
# Nightly PostgreSQL backup with 14-day retention.
# Dumps the database named in DATABASE_URL via pg_dump (custom format, compressed).
# DATABASE_URL is read from .env.local unless passed/exported.
set -euo pipefail

PROJECT_DIR="/mnt/hermes-data/mmzphyo/Projects/WorldBet2026"
# Load DATABASE_URL from .env.local if not already in the environment.
if [ -z "${DATABASE_URL:-}" ] && [ -f "$PROJECT_DIR/.env.local" ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' "$PROJECT_DIR/.env.local" | head -1 | cut -d= -f2-)
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "backup: DATABASE_URL not set and not found in .env.local" >&2
  exit 1
fi

DEST="${1:-$HOME/worldbet-backups}"
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M)
OUT="$DEST/worldbet-$STAMP.dump"

# -Fc = custom format (compressed, restore with pg_restore). --no-owner keeps it
# portable across roles. Connection string drives host/db/credentials.
pg_dump --no-owner --format=custom --dbname="$DATABASE_URL" --file="$OUT"

find "$DEST" -name 'worldbet-*.dump' -mtime +14 -delete
echo "Backup complete: $OUT"
