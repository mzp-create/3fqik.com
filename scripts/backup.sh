#!/usr/bin/env bash
# Nightly SQLite backup with 14-day retention.
# Uses better-sqlite3 node one-liner (sqlite3 CLI not required on this host).
set -euo pipefail
DB="${1:-/mnt/hermes-data/mmzphyo/Projects/WorldBet2026/worldbet.db}"
DEST="${2:-$HOME/worldbet-backups}"
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M)
node -e "require('better-sqlite3')(process.argv[1]).backup(process.argv[2])" "$DB" "$DEST/worldbet-$STAMP.db"
find "$DEST" -name 'worldbet-*.db' -mtime +14 -delete
echo "Backup complete: $DEST/worldbet-$STAMP.db"
