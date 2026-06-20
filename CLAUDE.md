# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

**3fqik** (domain `3fqik.com`; the repo/dir is still named `WorldBet2026`) — a mobile, dark-themed PWA for betting on the 2026 FIFA World Cup. Players bet **Asian handicap** and **Over/Under** lines; admin manages lines/scores/settlement. See `docs/ARCHITECTURE.md` for the full current picture.

Key paths:

- `src/lib/engine/grade.ts` — pure AH/OU grading engine (all money math). Change only with its test table.
- `src/lib/db/schema.ts` — Drizzle **Postgres** (pg-core) schema (all tables).
- `src/lib/bets/place.ts` — `placeBet` (started-gate, two-sided price snapshot, house limits, per-tier caps) **and** `recordBet` (admin manual recording that bypasses those gates).
- `src/lib/bets/settleMatch.ts` — grade tickets on final score + close the day.
- `src/lib/accounting/` — settlement (`settle.ts`), dashboard/exposure (`dashboard.ts`), queries.
- `src/app/(player)/` — player app: board (`page.tsx`), dedicated bet page (`bet/[matchId]/`), bets, balance, profile, rules, **practice/** (client-only demo).
- `src/app/(auth)/` — login/register behind `layout.tsx` + `OnboardingGate` (install + language gate).
- `src/app/admin/` — admin pages (lines, scores, settle, bets+record-form, reports, players, audit, settings, overview).
- `src/app/api/` — route handlers (admin/, auth/, bets, matches[+/[matchId]], balance, stream).
- `src/lib/client/format.ts` — display + pure helpers (`matchStarted`, `winNeed`, `pickLabel`, `teamLabel`, money formatters).
- `src/lib/client/practice.ts` — client-only practice store (`usePractice`, `resolveDemo` via the pure `gradeBet`).
- `data/fixtures.json` — 104 WC2026 fixtures · `scripts/` — seed.ts, create-admin.ts, backup.sh, resolve-bracket.ts.

Stack: **Next.js 16** App Router, TypeScript, **Tailwind v4** (dark "Dark Stadium" theme, CSS tokens), **Drizzle ORM + Postgres** (`pg`/node-postgres; **PGlite** in tests via `createTestDb`), jose, bcryptjs, vitest. Bilingual EN/MM (`src/lib/i18n/{en,mm}.ts`, parity test). PWA (manifest + `public/sw.js`).

> The app migrated from SQLite → Postgres (see `docs/superpowers/specs/2026-06-15-postgres-migration-design.md`; migrations restart at `0000_init_pg`). `better-sqlite3` lingers in deps but is **not** the live DB.

## Commands

- `npm run dev` — dev server (port 3000) · `npm run build` — prod build (incl. TS check) · `npm run lint` · `npm test` (vitest, ~231 tests)
- `npm run db:migrate` — apply Drizzle migrations (reads `DATABASE_URL`) · `npm run db:seed` (idempotent) · `npm run db:setup` · `npm run db:create-admin <phone> <pin> <name>`
- **Migrations affect TWO databases**: production `worldbet` (`.env.local`) and staging `worldbet_staging` (`.env.staging`). When a change adds a migration, run `db:migrate` against **both** at deploy (export each `DATABASE_URL`). Latest migration: `drizzle/0005_user_tiers.sql`.

## Deploy topology (important)

- **Dev/working copy**: this dir `/mnt/hermes-data/mmzphyo/Projects/WorldBet2026` (git checkout; you work here).
- **Production checkout**: `/mnt/hermes-data/mmzphyo/Worldbet` — a git checkout on `main`; deploy via `git pull && npm run build` (+ `npm run db:migrate` if a migration landed) and restart.
- **systemd services** (run from the prod checkout): `worldbet.service` (prod, `127.0.0.1:3000`, DB `worldbet`), `worldbet-staging.service` (staging, `172.26.5.171:3000` ≈ public, DB `worldbet_staging`), `worldbet-bracket.timer` (3h bracket resolver). Both web services **share one build/folder**. Nightly `backup.sh` cron.
- **Flow**: edit here → commit → `git push origin main` → on the prod folder `git pull && npm ci?(only if deps changed) && npm run build` → `sudo systemctl restart worldbet worldbet-staging`. Verify `curl :3000/login` on both. Eyeball big UI changes on the staging interface first.

## Conventions

- **Package manager**: npm only. No pnpm/yarn/bun lockfiles.
- **Money encoding**: integer MMK everywhere. Malay prices ×100 (`priceC`: 0.92→92, −0.98→−98). Handicap/goals balls ×4 (`ballQ`: 0.75→3; O/U `ballQ=10` → 2.5 goals). Markets: `'ah'` | `'ou'`.
  - **Two-sided lines**: `lines.priceC` = primary side (fav/over), `lines.priceOppC` = opposite side (dog/under). Each **bet snapshots its side's price** into `bets.priceC` at placement — grading and all price displays read the bet snapshot, never the line. (`grade.ts` unchanged: it takes `side`+`priceC` per bet.)
- **Betting guardrail**: players may bet only on **scheduled** matches whose kickoff hasn't passed. `placeBet` rejects once `status != scheduled` OR `kickoffUtc <= now` (`betting_started`). The UI mirrors this (`matchStarted()` in board/bet page). Admins record post-start/finished bets via `recordBet` (the admin Bets "Record bet" form), which bypasses the gate, house pool, and tier caps.
- **User tiers**: `players.tier` `standard|pro`. Standard caps (configurable in admin Settings): per-bet `stdMaxStakeMmk` (500k), outstanding `stdOutstandingMmk` (1,000,000 = sum of pending stakes), `stdMaxBetsPerMatch` (2). Pro skips tier caps; the **house daily-pool + per-match carve-out apply to everyone**.
- **Practice mode** (`/practice`): a **client-only** sandbox (localStorage demo balance, real matches read-only, simulated results via the pure `gradeBet`). It must **never** call `/api/bets`/`placeBet`/`recordBet` — isolation is the invariant.
- **Formatting**: Prettier runs automatically via a PostToolUse hook on edited files.
- **Tailwind v4** — dark tokens in `src/app/globals.css` `@theme` (`bg-canvas/surface/surface-2/raised`, `text-ink/muted/faint`, accents `mx`/`us`/`ca`/`gold` + `*-neon` price colors). No `tailwind.config.js`. Admin is dark too.
- **i18n**: every key added to `en.ts` must be added to `mm.ts` (parity test enforces). Burmese strings are machine-draft pending a native pass (note in `mm.ts`).
- Referrals: `players.referred_by`; personal `invite_codes` row per player; profile invite has native-share (Web Share API) + copy.
