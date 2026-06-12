# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

WorldBet2026 — mobile live-betting web app for the 2026 FIFA World Cup. Players bet on Asian handicap lines; admin manages lines/scores/settlements. Key paths:

- `src/lib/engine/grade.ts` — pure AH grading engine (all money logic)
- `src/lib/db/schema.ts` — Drizzle/SQLite schema (all tables)
- `src/lib/bets/place.ts` — bet placement transaction (version locks, limits)
- `src/lib/bets/settleMatch.ts` — grade tickets on final score + day close
- `src/app/api/` — Next.js route handlers (admin/, auth/, bets, matches, balance, stream)
- `data/fixtures.json` — 104 WC2026 fixtures
- `scripts/` — seed.ts, create-admin.ts, backup.sh

Stack: Next.js 16 App Router, TypeScript, Tailwind v4, Drizzle ORM, better-sqlite3, jose, bcryptjs, vitest.

## Commands

- `npm run dev` — dev server (port 3000)
- `npm run build` — production build (includes TypeScript check)
- `npm run lint` — ESLint (flat config, `eslint.config.mjs`)
- `npm test` — run all vitest tests
- `npm run db:migrate` — apply Drizzle migrations
- `npm run db:seed` — seed 104 fixtures + default settings (idempotent)
- `npm run db:setup` — migrate + seed in one step
- `npm run db:create-admin <phone> <pin> <name>` — create first admin user

## Conventions

- **Package manager**: npm only. Do not introduce pnpm, yarn, or bun lockfiles.
- **Money encoding**: all amounts are integer MMK. Malay prices stored ×100 (`priceC`: e.g. 0.92 → 92, −0.98 → −98). Handicap balls stored ×4 (`ballQ`: e.g. 0.75 → 3). Lines carry a `market` field (`'ah'` Asian handicap | `'ou'` total goals); for O/U the same `ballQ` ×4 encoding represents the goals line (e.g. `ballQ=10` → O/U 2.5 goals). Grading logic lives in `src/lib/engine/grade.ts` — change only with its test table.
- **Formatting**: Prettier (default config) runs automatically via a PostToolUse hook on every file Claude edits.
- Tailwind is v4 — configured via CSS (`src/app/globals.css`), no `tailwind.config.js`.
