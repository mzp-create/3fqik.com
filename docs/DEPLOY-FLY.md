# WorldBet2026 — Fly.io Deployment Guide

> **Self-hosting behind Caddy/nginx?** See [DEPLOY.md](./DEPLOY.md) instead.

## Overview

- **Platform**: Fly.io (https://fly.io)
- **Region**: `sin` (Singapore)
- **Machine**: Single always-on VM (do NOT scale to >1 — SQLite is single-writer)
- **Database**: SQLite on a Fly Volume named `data`, mounted at `/data`
- **Domain**: `3fqik.com` (cert provisioned by Fly)

---

## Prerequisites

Install `flyctl` and authenticate:

```bash
# Install flyctl (macOS/Linux)
curl -L https://fly.io/install.sh | sh

# Authenticate
fly auth login
```

---

## One-Time Setup

### 1. Create the app

```bash
fly launch --no-deploy --name worldbet2026 --region sin
```

If the app already exists:

```bash
fly apps create worldbet2026 --machines
```

### 2. Create the persistent volume

```bash
fly volumes create data --region sin --size 1
```

This creates a 1 GB volume. The app mounts it at `/data`; SQLite lives at `/data/worldbet.db`.

> **Important**: Only one machine + one volume. Adding more machines requires a distributed database (not SQLite). The fly.toml already sets `min_machines_running = 1` and `auto_stop_machines = false` to keep the single machine always on.

### 3. Set secrets

```bash
fly secrets set \
  SESSION_SECRET=$(openssl rand -hex 32) \
  TICKET_SECRETS=$(openssl rand -hex 32)
```

`NODE_ENV`, `DATABASE_PATH`, and `APP_ORIGIN` are already in `fly.toml` under `[env]` — no need to set them as secrets.

---

## Deploy

```bash
fly deploy
```

On every deploy, `scripts/start.sh` runs:

1. `npm run db:migrate` — applies any new Drizzle migrations (idempotent)
2. `npm run db:seed` — seeds 104 WC2026 fixtures + default settings (skips if already seeded)
3. `exec npx next start -H 0.0.0.0 -p 3000` — starts the app

Tail logs during deploy:

```bash
fly logs
```

---

## First-Run: Create Admin User

After the first successful deploy, create the admin account on the machine that has the volume:

```bash
fly ssh console -C "npm run db:create-admin 09448019562 090210 Zeya"
```

Expected output: `admin created`

General usage:

```bash
fly ssh console -C "npm run db:create-admin <phone> <6-digit-pin> <name>"
```

---

## Custom Domain: 3fqik.com

`APP_ORIGIN` is already set to `https://3fqik.com` in `fly.toml`.

### 1. Add the cert

```bash
fly certs add 3fqik.com
```

Fly prints the DNS records to add (A/AAAA for apex, or CNAME for subdomain).

### 2. Add DNS records at your registrar

Point `3fqik.com` to the IP/CNAME Fly printed. Propagation typically takes a few minutes.

### 3. Verify cert issuance

```bash
fly certs show 3fqik.com
```

Look for `Status: Ready` / `Issued`.

### Note on APP_ORIGIN during cert provisioning

Until the cert is live and DNS has propagated, QR ticket links will use `https://3fqik.com` (which won't resolve yet). Options:

- Wait for the cert before sharing tickets (recommended).
- Temporarily use the `*.fly.dev` URL: `fly secrets set APP_ORIGIN=https://worldbet2026.fly.dev`, then set it back once the cert is live.

---

## Updating the App

```bash
git pull
fly deploy
```

`start.sh` re-runs migrations and seed idempotently on every boot, so no manual DB steps are needed.

---

## Backups

Fly automatically takes daily volume snapshots.

**List snapshots**:

```bash
# Get your volume ID first
fly volumes list

# Then list snapshots for that volume
fly volumes snapshots list <vol_id>
```

**Manual database pull** (pull the live SQLite file to your laptop):

```bash
fly ssh sftp get /data/worldbet.db ./worldbet-backup-$(date +%Y%m%d).db
```

> The repo's `scripts/backup.sh` and the crontab setup in `DEPLOY.md` are for self-hosted deployments only — not needed on Fly.

---

## Scaling Warning

**Do NOT scale to more than 1 machine.**

```bash
# Check current machine count
fly scale show

# If accidentally scaled up, scale back down
fly scale count 1
```

SQLite is a single-writer database and the in-process SSE (Server-Sent Events) for live match updates does not cross machine boundaries. Scaling to >1 machine will cause split-brain data and broken live updates.

---

## Troubleshooting

**Check app status**:

```bash
fly status
```

**Tail live logs**:

```bash
fly logs
```

**SSH into the machine**:

```bash
fly ssh console
```

**Check database from inside the machine**:

```bash
fly ssh console -C "ls -lh /data/"
```

**Restart the machine**:

```bash
fly machine restart
```

**Re-run migrations manually** (if needed):

```bash
fly ssh console -C "npm run db:migrate"
```
