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

echo "==> Starting Next.js..."
exec npx next start -H 0.0.0.0 -p 3000
