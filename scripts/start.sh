#!/usr/bin/env bash
# scripts/start.sh — container entrypoint for production
# Runs on every boot: migrate (idempotent), seed (idempotent), then start Next.js.
# The Fly volume at /data must be mounted BEFORE this runs — which is guaranteed
# because this is the CMD of the Docker image (not a release_command).

set -euo pipefail

echo "==> Running database migrations..."
npm run db:migrate

echo "==> Running database seed..."
npm run db:seed

echo "==> Bootstrapping admin (if ADMIN_BOOTSTRAP set)..."
node scripts/bootstrap-admin.cjs

# One-time data migration after a grading-rule change. Idempotent (recomputes
# net from the final score; only touches unsettled bets). Gate with a secret so
# it runs on the machine that has the /data volume; unset once confirmed.
if [ "${REGRADE_ON_BOOT:-}" = "1" ]; then
  echo "==> Re-grading bets to current engine..."
  npm run db:regrade
fi

echo "==> Starting Next.js..."
exec npx next start -H 0.0.0.0 -p 3000
