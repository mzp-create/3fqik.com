# 3fqik Admin MCP — Setup Guide

How to set up and run the admin MCP server so the **hermes-agent** chatbot can drive 3fqik admin
operations (post lines, enter scores, settle, manage players…).

- **What it is / how it works:** `mcp/README.md`
- **Design rationale:** `docs/superpowers/specs/2026-06-23-admin-mcp-server-design.md`

> **Status on this host (as of 2026-06-23):** already activated on **staging and prod**. Bot admin
> `3fqik Bot` (phone `6594559552`) exists in both DBs; `MCP_ADMIN_TOKEN` + `BOT_ADMIN_PHONE` are set
> in `/mnt/hermes-data/mmzphyo/Worldbet/.env.local` (prod) and `.env.staging`. If you're just wiring
> hermes-agent, skip to **Step 4**. Steps 1–3 are the from-scratch / new-environment runbook.

## How it fits together

```
hermes-agent ──stdio──> mcp/server.ts ──HTTP + Bearer──> worldbet web app ──> Postgres + live SSE
```

The MCP server is a thin client of the running web app's admin HTTP API. It authenticates as a
dedicated **bot-admin player** using a shared **service bearer token**. Routing through HTTP (not the
DB directly) keeps validation, audit logging, and live player updates in the one web process.

## Prerequisites

- The web app deployed and running (prod `127.0.0.1:3000`, staging `172.26.5.171:3000`).
- Node 22 + npm, repo deps installed (`npm ci`) — the MCP SDK + zod ship in `package.json`.
- Shell access to the deploy host (the MCP server runs there, launched by hermes-agent).

## Step 1 — Create the bot-admin player

The bot acts as a real `role=admin` player. Pick a phone + 6-digit PIN. If the phone is a valid
Myanmar number (`09…`), use the standard script:

```bash
cd /mnt/hermes-data/mmzphyo/Worldbet
npm run db:create-admin <phone> <6-digit-pin> "3fqik Bot"
```

If the phone is **not** a Myanmar `09…`/`+959…` number (the normaliser would reject it), insert it
literally — fine for the bot, which never uses PIN login (it authenticates via the bearer):

```bash
# run once per target DB (export the matching DATABASE_URL first)
node -e '…' # or a small insert script; store phone verbatim, role="admin"
```

Run against **each** database you target — export the right `DATABASE_URL` first:

```bash
export $(grep -E "^DATABASE_URL=" .env.staging | head -1 | xargs)   # staging
export $(grep -E "^DATABASE_URL=" .env.local   | head -1 | xargs)   # prod
```

## Step 2 — Set the env vars (per environment)

Generate a strong token and add both vars to the app's env file. Use a **separate token per
environment** (prod ≠ staging):

```bash
cd /mnt/hermes-data/mmzphyo/Worldbet
TOK=$(openssl rand -hex 32)
printf '\n# Admin MCP server (hermes-agent)\nMCP_ADMIN_TOKEN=%s\nBOT_ADMIN_PHONE=<bot phone>\n' "$TOK" >> .env.local     # prod
# repeat with a fresh token for .env.staging
```

Both `MCP_ADMIN_TOKEN` (≥32 chars) and `BOT_ADMIN_PHONE` must be present, or the bearer path stays
**dormant** (the app behaves exactly as before). `BOT_ADMIN_PHONE` must match the **stored** phone
exactly.

## Step 3 — Restart the web service

```bash
sudo systemctl restart worldbet            # prod
sudo systemctl restart worldbet-staging    # staging
```

Verify the bearer path is live (replace `<TOKEN>`; reads the token straight from the env file):

```bash
TOK=$(grep -E "^MCP_ADMIN_TOKEN=" .env.local | cut -d= -f2)
curl -s -o /dev/null -w "no-token  %{http_code}\n"  http://127.0.0.1:3000/api/admin/dashboard            # → 401
curl -s -o /dev/null -w "valid     %{http_code}\n" -H "Authorization: Bearer $TOK" \
     http://127.0.0.1:3000/api/admin/dashboard                                                          # → 200
```

## Step 4 — Register with hermes-agent

Read the **prod** token (don't paste secrets into shared chats):

```bash
grep MCP_ADMIN_TOKEN /mnt/hermes-data/mmzphyo/Worldbet/.env.local
```

Add this server to hermes-agent's MCP config (exact format per hermes-agent):

```jsonc
{
  "mcpServers": {
    "3fqik-admin": {
      "command": "npx",
      "args": ["tsx", "/mnt/hermes-data/mmzphyo/Worldbet/mcp/server.ts"],
      "env": {
        "APP_BASE_URL": "http://127.0.0.1:3000",
        "MCP_ADMIN_TOKEN": "<paste prod token>",
        "BOT_ADMIN_PHONE": "6594559552",
      },
    },
  },
}
```

To rehearse against **staging** instead, set `APP_BASE_URL=http://172.26.5.171:3000` and use the
staging token.

## Step 5 — Try it

Restart hermes-agent so it picks up the new server, then ask it things like:

- "What's the house exposure today?" → `get_dashboard`
- "Find Netherlands' next match." → `find_matches`
- "Set match 34 NED −1.0 at +0.45." → `post_line` (handicap/price in human units; opposite mirrors)
- "Mark match 33 final 2–1." → `confirm_final_score`
- "Make player 7 a pro." → `set_tier`

## Tools (33)

**Reads:** `get_dashboard`, `get_matches`, `find_matches`, `list_bets`, `get_audit_log`,
`list_players`, `get_settings`, `get_settlement_board`, `list_invites`, `report_balances`,
`report_player`, `report_daily`, `report_pnl`, `get_odds_reference`, `fetch_score_candidates`.

**Writes (flagged destructive):** `post_line`, `post_lines_bulk`, `suspend_line`, `resume_line`,
`close_line`, `set_match_live`, `update_live_score`, `confirm_final_score`, `correct_score`,
`record_bet`, `mark_player_paid`, `void_ticket`, `reset_pin`, `unlock_player`, `grant_admin`,
`set_tier`, `create_invite`, `update_settings`.

**Units:** line tools take `handicapGoals` (e.g. `1.0`, `0.75`) and `priceMalay` (e.g. `0.45`,
`-0.98`); the opposite side mirrors as `−price` unless `priceOppMalay` is given.

## Safety model

- Money-critical tools **execute immediately** (no confirm step) — be precise in chat.
- Attribution: money actions write `audit_log` (actor = bot admin); line/score posts record
  `postedBy`. Review with `get_audit_log` or the admin Audit page.
- The bearer token is honored only on the `Authorization` header; the admin API is bound to
  `127.0.0.1` in prod, so the token never transits a network. Keep tokens out of git (env files are
  gitignored).

## Troubleshooting

| Symptom                                       | Cause / fix                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Every tool returns `[unauthorized]` / 401     | `MCP_ADMIN_TOKEN` mismatch between hermes-agent env and the app's env file, or the web service wasn't restarted after setting it. |
| 401 even with the right token                 | `BOT_ADMIN_PHONE` doesn't match the stored phone, or the bot player isn't `role=admin`.                                           |
| `[bad_line] line must be a multiple of 0.25`  | `handicapGoals`/price off-grid — use 0.25 steps; price −1.00…+1.00, not 0.                                                        |
| Tools work but players don't see updates live | Confirm `APP_BASE_URL` points at the **running** web service (SSE fires there), not a stale port.                                 |
| Server won't start                            | Run `npm run mcp` manually with the env vars to see stderr; ensure `npm ci` ran in the checkout.                                  |

## Rehearse the server directly (optional)

```bash
cd /mnt/hermes-data/mmzphyo/Worldbet
APP_BASE_URL=http://172.26.5.171:3000 \
MCP_ADMIN_TOKEN=$(grep -E "^MCP_ADMIN_TOKEN=" .env.staging | cut -d= -f2) \
BOT_ADMIN_PHONE=6594559552 \
npx @modelcontextprotocol/inspector npx tsx mcp/server.ts
```
