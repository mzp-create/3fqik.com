# 3fqik Admin MCP Server

Exposes 3fqik admin operations as MCP tools so the **hermes-agent** chatbot can drive them.
Design: `docs/superpowers/specs/2026-06-23-admin-mcp-server-design.md`.

It is a thin client of the running web app's admin HTTP API (so validation, audit logging, and
SSE live-updates all happen in the web process). It authenticates as a dedicated **bot-admin
player** via a service bearer token.

## Setup (one-time)

1. Create the bot-admin player (on each DB you target):
   ```
   npm run db:create-admin <phone> <pin> "3fqik Bot"
   ```
2. In the app's env (`.env.local` / `.env.staging`) set:
   ```
   MCP_ADMIN_TOKEN=<32+ random chars>      # openssl rand -hex 32
   BOT_ADMIN_PHONE=<the bot's phone>
   ```
   Both must be present for the bearer auth path to activate. Restart the web service.

## Run

```
APP_BASE_URL=http://127.0.0.1:3000 MCP_ADMIN_TOKEN=… BOT_ADMIN_PHONE=… npm run mcp
```

`APP_BASE_URL` defaults to `http://127.0.0.1:3000` (prod). Use the staging IP to rehearse.

## Inspect

```
APP_BASE_URL=… MCP_ADMIN_TOKEN=… BOT_ADMIN_PHONE=… \
  npx @modelcontextprotocol/inspector npx tsx mcp/server.ts
```

## hermes-agent registration (stdio)

```jsonc
{
  "mcpServers": {
    "3fqik-admin": {
      "command": "npx",
      "args": ["tsx", "/mnt/hermes-data/mmzphyo/Worldbet/mcp/server.ts"],
      "env": {
        "APP_BASE_URL": "http://127.0.0.1:3000",
        "MCP_ADMIN_TOKEN": "<same token as the app>",
        "BOT_ADMIN_PHONE": "<bot phone>",
      },
    },
  },
}
```

## Tools

Reads: `get_dashboard`, `get_matches`, `find_matches`, `list_bets`, `get_audit_log`,
`list_players`, `get_settings`, `get_settlement_board`, `list_invites`, `report_balances`,
`report_player`, `report_daily`, `report_pnl`, `get_odds_reference`, `fetch_score_candidates`.

Writes (flagged `destructiveHint`): `post_line`, `post_lines_bulk`, `suspend_line`, `resume_line`,
`close_line`, `set_match_live`, `update_live_score`, `confirm_final_score`, `correct_score`,
`record_bet`, `mark_player_paid`, `void_ticket`, `reset_pin`, `unlock_player`, `grant_admin`,
`set_tier`, `create_invite`, `update_settings`.

Line tools take **human units** — `handicapGoals` (e.g. `1.0`, `0.75`) and `priceMalay` (e.g.
`0.45`, `-0.98`); the opposite side mirrors as `−price` unless `priceOppMalay` is given.
