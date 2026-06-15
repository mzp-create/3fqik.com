# WorldBet2026 — Production Deployment Guide

> **Fly.io (recommended hosted option):** see [DEPLOY-FLY.md](./DEPLOY-FLY.md). The steps below are for self-hosting behind Caddy/nginx.

## Prerequisites

- Node.js 20+ (`node --version`)
- npm 10+
- A reverse proxy (Caddy or nginx) with HTTPS termination — **required**: session cookies are `Secure` and QR URLs embed `APP_ORIGIN`

---

## Environment Checklist

Copy `.env.example` to `.env.local` (or set as system env vars) and fill all values:

| Variable         | Required | Notes                                                                             |
| ---------------- | -------- | --------------------------------------------------------------------------------- |
| `DATABASE_URL`   | yes      | Postgres connection string, e.g. `postgres://worldbet:PW@localhost:5432/worldbet` |
| `SESSION_SECRET` | yes      | Random ≥32-char string — `openssl rand -hex 32`                                   |
| `TICKET_SECRETS` | yes      | Comma-separated; first entry = current signing key — `openssl rand -hex 32`       |
| `APP_ORIGIN`     | yes      | Public HTTPS base URL e.g. `https://bet.example.com` — no trailing slash          |
| `NODE_ENV`       | yes      | Set to `production`                                                               |

---

## Build

```bash
npm ci
npm run build
```

The build runs TypeScript type-checking. Fix any errors before continuing.

---

## Database: PostgreSQL

The app runs on PostgreSQL (self-hosted on the box). One-time server setup:

```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
# create role + database
sudo -u postgres psql -c "CREATE ROLE worldbet LOGIN PASSWORD 'CHANGE_ME';"
sudo -u postgres createdb -O worldbet worldbet
# then put the matching DATABASE_URL in .env.local
```

First-run schema + data:

```bash
export DATABASE_URL=postgres://worldbet:CHANGE_ME@localhost:5432/worldbet
npm run db:migrate         # apply Postgres migrations (drizzle/0000_init_pg.sql …)
npm run db:seed            # seed 104 WC2026 fixtures + default settings (idempotent)
npm run db:create-admin <phone> <6-digit-pin> <name>
```

Run `db:migrate` again after each update to apply new migrations.

### Migrating existing SQLite data → Postgres

A one-time cutover script copies every row from a legacy `worldbet.db` into the
Postgres DB (run after `db:migrate`):

```bash
SQLITE_PATH=./worldbet.db DATABASE_URL=postgres://… npm run db:cutover
# re-run into a non-empty target with FORCE=1 (TRUNCATEs first)
```

---

## Running as a Systemd Service

Save to `/etc/systemd/system/worldbet.service`:

```ini
[Unit]
Description=WorldBet2026
After=network.target

[Service]
WorkingDirectory=/mnt/hermes-data/mmzphyo/Projects/WorldBet2026
ExecStart=/usr/bin/npm start
Restart=always
EnvironmentFile=/mnt/hermes-data/mmzphyo/Projects/WorldBet2026/.env.local

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable worldbet
sudo systemctl start worldbet
sudo journalctl -u worldbet -f   # tail logs
```

The Next.js server listens on port 3000 by default. Point your reverse proxy at `localhost:3000`.

---

## HTTPS Requirement

Session cookies are set with `Secure` in production. QR ticket URLs are generated from `APP_ORIGIN`. Both require HTTPS. Without HTTPS, logins silently fail to persist the cookie.

### Domain: 3fqik.com (one-time setup)

1. **DNS** — at your registrar, add an A record for `3fqik.com` (and optionally `www.3fqik.com`) pointing to this server's public IP. Verify: `dig +short 3fqik.com`.
2. **Firewall** — open inbound TCP **80** and **443** in the AWS security group (80 is needed for the Let's Encrypt challenge).
3. **Caddy** — a ready `Caddyfile` is in the repo root (proxies `3fqik.com` → `localhost:3000`, auto-provisions and renews TLS). Install and run:
   ```bash
   sudo apt install -y caddy        # or per https://caddyserver.com/docs/install
   sudo cp Caddyfile /etc/caddy/Caddyfile
   sudo systemctl restart caddy
   sudo journalctl -u caddy -f      # watch cert issuance
   ```
4. **Env** — set `APP_ORIGIN=https://3fqik.com` and `NODE_ENV=production` (see `.env.production.example`), then restart the app service so QR links and cookies use the domain.

nginx alternative: `proxy_pass http://localhost:3000` behind a valid TLS cert; same env requirements.

---

## Backup Cron

Install the nightly backup with 14-day retention (18:30 UTC = 01:00 MMT):

```bash
chmod +x scripts/backup.sh
(crontab -l 2>/dev/null; echo "30 18 * * * /mnt/hermes-data/mmzphyo/Projects/WorldBet2026/scripts/backup.sh") | crontab -
```

Backups land in `~/worldbet-backups/` as `worldbet-<stamp>.dump`. Run manually to
verify: `bash scripts/backup.sh`. Restore with
`pg_restore --clean --no-owner --dbname="$DATABASE_URL" <file>.dump`.

The script uses `pg_dump` (custom/compressed format) and reads `DATABASE_URL`
from `.env.local`.

---

## Updating

```bash
git pull
npm ci
npm run db:migrate   # apply any new migrations
npm run build
sudo systemctl restart worldbet
```
