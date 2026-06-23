# 3fqik Admin MCP Server — Design

> Spec for exposing 3fqik admin operations to the **hermes-agent** chatbot via a
> Model Context Protocol (MCP) server. Authored 2026-06-23. Pairs with
> `docs/ARCHITECTURE.md` and `CLAUDE.md`.

## Goal

Let an operator drive 3fqik admin functions from the hermes-agent chatbot in natural
language ("set Netherlands −1.0 at +0.45", "mark match 33 final 2–1", "settle player 7 for
the 21st"). Today admin is only reachable through the web UI at `/admin/*`. This adds an MCP
server that maps those capabilities to MCP tools.

## Decisions

- **Transport:** local **stdio** — hermes-agent launches the server as a subprocess on this host.
- **Scope:** **full admin** — lines, scores, bets, settlement, players/tiers, settings, invites, reads.
- **Destructive-op guard:** **execute directly** (no two-step confirm). Safeguards are the
  built-in **audit log** (every write attributed to the bot admin) and MCP `destructiveHint`
  annotations so hermes-agent can warn before money-critical calls.

## Architecture

The MCP server is a **thin client of the app's existing admin HTTP API** — it does not call lib
functions or the DB directly.

**Why HTTP, not direct lib calls:** the SSE hub (`src/lib/sse.ts`) is a process-local singleton.
A separate process calling `postLine()`/`updateLiveScore()` would broadcast only within its own
process, so players' live screens would not update until their next fetch. Driving the web app's
HTTP API keeps validation, audit logging, **and** SSE broadcasts in the one running web service.

```
hermes-agent ──stdio──> 3fqik-mcp (Node/tsx, @modelcontextprotocol/sdk)
                              │  HTTP + Bearer token  (localhost only)
                              ▼
                   worldbet.service  http://127.0.0.1:3000/api/admin/*
                              │  requireAdmin() → bot-admin player
                              ▼   (existing lib fns: postLine, confirmFinalScore, …)
                        Postgres  +  sseHub.broadcast → live player updates
```

### Auth

A dedicated **bot-admin player** plus a **service bearer token** (`MCP_ADMIN_TOKEN`).
`src/lib/auth/session.ts` `currentPlayer()` checks, before the cookie path, for
`Authorization: Bearer <token>`; on a constant-time match with `MCP_ADMIN_TOKEN` (set, ≥32 chars)
it loads and returns the bot-admin player resolved by `BOT_ADMIN_PHONE`. `requireAdmin()` and every
admin route then work unchanged. The bearer path is rejected unless the resolved player is
`role: "admin"`. The admin API is bound to `127.0.0.1` in prod, so the token never transits a
network.

### Human-friendly units

Line tools accept real-world units — `handicapGoals` (`1.0`, `0.75`) and `priceMalay`
(`+0.45`, `-0.98`) — and the server converts to the wire encoding (`ballQ = goals×4`,
`priceC = round(price×100)`), mirroring the opposite side as `−priceC` unless given (the
established convention). Validates the 0.25 grid (`goals×4` integer) and price ∈ [−1,1]\{0}.
All money stays integer MMK.

### Error mapping

The app returns `{ ok:true, data }` on success and `{ ok:false, code, message, ...extra }` with an
HTTP status on failure (`src/lib/api.ts`). The MCP HTTP client throws on `ok:false`/non-2xx,
surfacing `code` + `message` to hermes-agent as the tool error.

## Components

- **MCP server** lives in the repo at `mcp/` so it deploys with the app:
  - `mcp/server.ts` — `McpServer` over `StdioServerTransport`; registers all tools.
  - `mcp/http.ts` — fetch wrapper: `APP_BASE_URL` (default `http://127.0.0.1:3000`) + bearer; parses the error envelope.
  - `mcp/encode.ts` — `handicapGoals→ballQ`, `priceMalay→priceC`, opposite-side mirror, validation.
  - `mcp/tools.ts` — all tool definitions (zod input schemas + handlers); grouped by capability.
- **App change:** the auth bearer shim in `src/lib/auth/session.ts` (single point).
- **Deps:** add `@modelcontextprotocol/sdk` + `zod`; `npm run mcp` → `tsx mcp/server.ts`.

## Tool catalog (full admin)

Reads set `readOnlyHint:true`; mutations set `destructiveHint:true`. Every tool maps 1:1 to an
existing endpoint; no new app endpoints are added (only the auth shim).

**Reads (GET):** `get_dashboard` (`/api/admin/dashboard`); `get_matches` / `find_matches({team?,date?,status?})`
(`/api/matches`, filtered client-side); `list_bets({status?,q?})`; `get_audit_log`; `list_players`;
`get_settings`; `get_settlement_board({date})`; `list_invites`; `report_balances`;
`report_player({playerId,from,to})`; `report_daily({from,to})`; `report_pnl({from,to})`;
`get_odds_reference`; `fetch_score_candidates`.

**Lines (`/api/admin/lines`):** `post_line({matchId,market,favSide?,handicapGoals,priceMalay,priceOppMalay?})`;
`post_lines_bulk({lines:[…]})`; `suspend_line` / `resume_line` / `close_line({matchId,market})`.

**Scores (`/api/admin/scores`):** `set_match_live({matchId})`; `update_live_score({matchId,home,away})`;
`confirm_final_score({matchId,home,away})`; `correct_score({matchId,home,away})`.

**Bets / settlement / players / settings / invites:**
`record_bet({playerId,matchId,market,side,stakeMmk,scoreHomeAtBet?,scoreAwayAtBet?})`;
`mark_player_paid({date,playerId,paymentMethod?,paymentReference?,remark?})`; `void_ticket({ticketNo,reason})`;
`reset_pin({playerId,tempPin})`; `unlock_player({playerId})`; `grant_admin({playerId})`; `set_tier({playerId,tier})`;
`update_settings({…partial})`; `create_invite({maxUses,expiresAt})`.

## Security

- `MCP_ADMIN_TOKEN`: 32+ random bytes; constant-time compare; honored only on the bearer path; admin
  API stays bound to `127.0.0.1`.
- All bot writes are audit-logged with `actorId` = bot admin — the trail is the safety net under the
  "execute directly" choice.
- Per-tool `destructiveHint` lets hermes-agent warn before money-critical calls.
- Rehearse against **staging** (`APP_BASE_URL=http://172.26.5.171:3000`) before pointing at prod.

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

## Verification

1. Unit conversion + auth-shim tests (vitest); existing tests stay green.
2. MCP Inspector against staging: list tools, `get_dashboard`, then `post_line`; confirm the line
   shows in staging admin UI, a connected player board updates live (SSE), and an `audit_log` row is
   attributed to the bot admin.
3. End-to-end via hermes-agent on staging; then deploy and point at prod.

## Rehearsal log (2026-06-23)

Built, deployed, and activated on **staging + prod**. Bot-admin `3fqik Bot`
(phone `6594559552`) — id 4 (staging), id 7 (prod); separate `MCP_ADMIN_TOKEN`
per env. Verified the bearer path (no/wrong token → 401, valid → 200) and ran a
full tool rehearsal via a stdio MCP client against staging (33 tools;
`get_dashboard`, `find_matches`, `post_line` with human units → encoded
ballQ/priceC + mirror, `set_tier`, and off-grid validation rejection).

**Cleanup:** the staging rehearsal posted test AH lines on matches 9 (GER) and
10 (NED); both were subsequently **closed** via `close_line`, so neither is
bettable. O/U lines were untouched. No prod test data was created (prod was
verified read-only). One-off `seed-bot-admin.ts` / `rehearse.ts` helpers were
removed after use.

**Audit note:** money actions (settle, void, final/correct score, record-bet,
player changes, settings) write `audit_log`; line/score posts are attributed via
the row's `postedBy` instead — both give bot attribution.

## Scope boundaries

- No new admin endpoints — only the auth shim + the MCP client.
- The quarter-line grading concern is out of scope; the server posts lines but does not touch `grade.ts`.
- Off-host hermes-agent later → add a Streamable-HTTP transport variant behind the same bearer.
