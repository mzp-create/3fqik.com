# WorldBet2026 — Production Deployment Guide

## Prerequisites

- Node.js 20+ (`node --version`)
- npm 10+
- A reverse proxy (Caddy or nginx) with HTTPS termination — **required**: session cookies are `Secure` and QR URLs embed `APP_ORIGIN`

---

## Environment Checklist

Copy `.env.example` to `.env.local` (or set as system env vars) and fill all values:

| Variable         | Required | Notes                                                                       |
| ---------------- | -------- | --------------------------------------------------------------------------- |
| `DATABASE_PATH`  | yes      | Absolute path to `worldbet.db` (e.g. `/srv/worldbet/worldbet.db`)           |
| `SESSION_SECRET` | yes      | Random ≥32-char string — `openssl rand -hex 32`                             |
| `TICKET_SECRETS` | yes      | Comma-separated; first entry = current signing key — `openssl rand -hex 32` |
| `APP_ORIGIN`     | yes      | Public HTTPS base URL e.g. `https://bet.example.com` — no trailing slash    |
| `NODE_ENV`       | yes      | Set to `production`                                                         |

---

## Build

```bash
npm ci
npm run build
```

The build runs TypeScript type-checking. Fix any errors before continuing.

---

## First-Run Database Setup

Run once on the production host before starting the app:

```bash
npm run db:migrate         # apply all Drizzle migrations
npm run db:seed            # seed 104 WC2026 fixtures + default settings
npm run db:create-admin <phone> <6-digit-pin> <name>
# e.g.: npm run db:create-admin 09700000001 111111 Admin
```

Re-running `db:seed` is safe (idempotent — skips if matches already exist).
Run `db:migrate` again after each update to apply new migrations.

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

Backups land in `~/worldbet-backups/`. Run manually to verify: `bash scripts/backup.sh`.

The script uses the `better-sqlite3` Node.js API (`sqlite3` CLI not required).

---

## Updating

```bash
git pull
npm ci
npm run db:migrate   # apply any new migrations
npm run build
sudo systemctl restart worldbet
```
