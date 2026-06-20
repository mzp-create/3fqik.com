# 3fqik — Architecture & Handoff

> Living overview of the current system. Last updated 2026-06-20. Pairs with `CLAUDE.md`
> (conventions) and the per-feature specs/plans under `docs/superpowers/`.

## What it is

**3fqik** (`3fqik.com`; repo dir `WorldBet2026`) — a dark-themed mobile PWA for betting on the
2026 FIFA World Cup. Players place **Asian-handicap** and **Over/Under** bets pre-match; an admin
posts lines, enters scores, and settles. Bilingual (English / Burmese).

## Stack & layout

- **Next.js 16** (App Router, Turbopack), TypeScript, **Tailwind v4** (CSS `@theme` dark tokens).
- **Postgres** via Drizzle (`pg`/node-postgres); tests use **PGlite** (`createTestDb` applies the
  same `drizzle/` migrations). Migrated from SQLite (see the postgres-migration spec).
- Auth: phone + 6-digit PIN, `jose` session cookie, `bcryptjs`. PWA: `app/manifest.ts` + `public/sw.js`.
- Route groups: `(player)` (board, bet, bets, balance, profile, rules, practice), `(auth)` (login/
  register behind the onboarding gate), `admin/` (lines, scores, settle, bets, reports, players,
  audit, settings, overview).

## Money model (the core)

- All amounts integer **MMK**. Prices are signed **Malay** odds ×100 (`priceC`); balls/goals ×4 (`ballQ`).
- **Lines are two-sided**: `lines.priceC` (primary = fav/over) + `lines.priceOppC` (opposite = dog/under),
  one `ballQ`, a `favSide`, `market` (`ah|ou`), versioned (a new post closes the prior version).
- **Bets snapshot their side's price** into `bets.priceC` at placement. Grading + every price display
  read the bet snapshot, never the line.
- **Grading** (`src/lib/engine/grade.ts`, pure, heavily test-tabled): per bet, `value` = margin (AH:
  effFav−effDog) or total (OU); win if beyond the line, push only on whole-number lines, else lose.
  Payout: win `+p·S` (p>0) or `+S` (p<0); lose `−S` (p>0) or `−|p|·S` (p<0); push 0. `effFav/effDog`
  are goals **since the bet's at-bet score** (clamped ≥0) — supports the legacy live model; today most
  bets are pre-match (at-bet 0-0).
- **Placement** (`src/lib/bets/place.ts`):
  - `placeBet(db, playerId, input, at)` — version-locks the line, **started-gate** (reject if
    `status!=scheduled` OR `kickoff<=now` → `betting_started`), resolves+snapshots the side price,
    **house limits** (per-match `betLimitMmk` carve-out OR `settings.dailyTotalLimitMmk` daily pool),
    then **per-tier caps** (standard only). All inside one serialized transaction (row locks).
  - `recordBet(db, adminId, input, at)` — admin manual recording; **bypasses** started/finished/day/
    house/tier gates; snapshots the latest line's side price; default at-bet 0-0; audit-logged.
- **Settlement**: `settleMatch.ts` grades pending tickets on the confirmed final score and closes the
  day; `accounting/settle.ts` rolls per-player day nets into `settlements`. House net = −Σ player net.

## Features (all shipped)

- **Dedicated bet page** `(player)/bet/[matchId]` — Polymarket-style pick-a-side, stake, "You win if…"
  (`winNeed`), payout preview, 2-tap confirm, SSE line-move handling.
- **Dark "Dark Stadium" theme** across player + admin; hamburger drawer (`MenuDrawer`) for non-tab items;
  3-tab bottom nav; `Full Name (ISO)` team labels (`teamLabel`); friendly empty states.
- **Two-sided pricing** (admin posts both prices; players pick either side).
- **Betting guardrail**: no player betting once a match starts (server + UI); admin "Record bet" form
  (`admin/bets` → `POST /api/admin/bets` action `record` → `recordBet`).
- **User tiers** (`standard|pro`): standard caps (per-bet, outstanding = Σ pending stake, bets/match)
  configurable in admin Settings; admin Players tier toggle; admin Overview exposure widgets (house
  outstanding, daily-pool usage, tier breakdown, top exposures). Pro skips tier caps; house pool applies
  to all.
- **Onboarding gate**: pick language → install-as-PWA prompt (iOS steps / Android prompt / browser
  escape) before login/register; choice in a `lang` cookie, seeds the new account's language.
- **Practice mode** `/practice` — **client-only** sandbox (localStorage demo balance, real matches
  read-only, results simulated via the pure `gradeBet`). Never touches `/api/bets` — fully isolated.
- **Other**: referrals + native invite share (Web Share API), bet cancel window, ticket PNG export,
  market-reference odds (The Odds API), 3h Wikipedia bracket resolver.

## Deploy & ops

- **Dev/working copy**: `/mnt/hermes-data/mmzphyo/Projects/WorldBet2026` (you edit here).
- **Prod checkout**: `/mnt/hermes-data/mmzphyo/Worldbet` (git checkout on `main`).
- **systemd** (from the prod checkout): `worldbet.service` (prod, `127.0.0.1:3000`, DB `worldbet`),
  `worldbet-staging.service` (staging, `172.26.5.171:3000`, DB `worldbet_staging`) — **share one build**;
  `worldbet-bracket.timer` (every 3h); nightly `backup.sh` cron (portable, derives its own dir).
- **Deploy**: edit → commit → `git push origin main` → on prod folder `git pull` → `npm run db:migrate`
  against **both** DBs **if a migration landed** → `npm run build` → `sudo systemctl restart worldbet
worldbet-staging` → verify `:3000/login` (both). Eyeball big UI on staging's interface first.
- Migrations: `drizzle/0000`…`0005_user_tiers`. Schema changes need a generated migration **and**
  db:migrate on both DBs.

## Specs & plans (history)

`docs/superpowers/specs/` + `plans/`: live-betting, postgres-migration, malay-pricing-model, dark-stadium-ui,
user-tiers-limits, onboarding-gate, practice-betting (+ over-under, referrals, settlement, admin-bet-mgmt
in plans). Brainstorm → spec → plan → subagent-driven build → deploy is the working cadence.

## Gotchas / pending

- `better-sqlite3` is still a dependency but **unused** for the live DB (Postgres).
- Burmese strings are machine-draft; a native-speaker pass is flagged in `mm.ts`.
- The dev folder has a stale Turbopack cache risk; for a true preview of what ships, `next build` +
  `next start`, not `next dev`.
- The `worldbet`/folder/service/DB names are infra identifiers — do **not** rename them when rebranding UI.
